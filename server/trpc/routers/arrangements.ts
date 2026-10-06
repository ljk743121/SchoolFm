import { parseDate } from "@internationalized/date";
import { TRPCError } from "@trpc/server";
import { consola } from "consola";
import { and, asc, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { db } from "~~/server/db";
import { arrangements, songs, users } from "~~/server/db/schema";
import { assembleArrange } from "~~/server/utils/arrange";
import { cacheDel, cacheGet, cacheSet } from "~~/server/utils/redis";
import { getArrangementVolatileMap, getVolatileSongMap } from "~~/server/utils/songCache";
import { getConfig } from "~~/server/utils/universal";
// import verifyHasPlayedToken from "~~/server/utils/verifyHasPlayedToken";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  requirePermission,
  router,
} from "../trpc";
// import { fitsInTime } from "./time";

const order = [asc(songs.position), asc(songs.createdAt)];

export async function invalidateArrangementCache() {
  // status 为易变字段不缓存，稳定缓存仅含 date 与 songs；统一使用单一版本键
  await cacheDel("arrangement:listSafe:stable");
  await cacheDel("arrangement:listGuest:stable");
  consola.info(`Redis 缓存失效：arrangement:listSafe:stable, arrangement:listGuest:stable`);
}

async function deleteArrangement(date: string) {
  const usedSongs = await db.query.songs.findMany({
    where: eq(songs.arrangementDate, date),
    columns: {
      id: true,
    },
  });
  for (const i of usedSongs) {
    await db
      .update(songs)
      .set({
        arrangementDate: null,
        position: null,
        state: "approved",
      })
      .where(eq(songs.id, i.id));
  }
  await db.delete(arrangements).where(eq(arrangements.date, date));
  await invalidateArrangementCache();
}

export const arrangementsRouter = router({
  list: adminProcedure.use(requirePermission(["arrange"])).query(async () => {
    return await db.query.arrangements.findMany({
      orderBy: desc(arrangements.date),
      columns: {
        date: true,
      },
      with: {
        songs: {
          orderBy: order,
          columns: {
            id: true,
            creator: true,
            ownerDisplayName: true,
            name: true,
            songId: true,
            source: true,
            imgId: true,
            duration: true,
            rejectMessage: true,
            message: true,
            state: true,
            createdAt: true,
            expectedPlayDate: true,
          },
        },
      },
    });
  }),

  listApproved: adminProcedure.use(requirePermission(["manualArrange"])).query(async () => {
    return await db.query.songs.findMany({
      where: inArray(songs.state, ["approved", "missed", "failed", "dropped"]),
      orderBy: [desc(songs.arrangementDate), desc(songs.createdAt)],
    });
  }),

  updateOrder: adminProcedure
    .use(requirePermission(["manualArrange"]))
    .input(
      z.array(
        z.object({
          date: z.string(),
          songOrder: z.array(z.number()), // song id array
        }),
      ),
    )
    .mutation(async ({ input }) => {
      const allSongIds = input.flatMap(day => day.songOrder);
      const uniqueSongIds = [...new Set(allSongIds)];
      const songRows = uniqueSongIds.length
        ? await db.query.songs.findMany({
          where: inArray(songs.id, uniqueSongIds),
          columns: { id: true, duration: true },
        })
        : [];
      const durationMap = new Map(songRows.map(s => [s.id, s.duration ?? 0]));

      const overLimitDates = input
        .filter(day => day.date !== "approved")
        .map((day) => {
          const total = day.songOrder.reduce((sum, id) => sum + (durationMap.get(id) ?? 0), 0);
          return { date: day.date, total };
        })
        .filter(day => day.total > MAX_DAILY_SONG_DURATION);

      if (overLimitDates.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `以下日期播放总时长超过 45 分钟：${overLimitDates.map(d => `${d.date}(${Math.round(d.total / 60)}分钟)`).join(", ")}`,
        });
      }

      await db.transaction(async (tx) => {
        for (const dayChange of input) {
          if (dayChange.date === "approved") {
            for (const songId of dayChange.songOrder) {
              if (!songId)
                continue;
              await tx
                .update(songs)
                .set({
                  state: "approved",
                  arrangementDate: null,
                  position: null,
                })
                .where(eq(songs.id, songId));
            }
            continue;
          }
          const arrangement = await tx.query.arrangements.findFirst({
            where: eq(arrangements.date, dayChange.date),
          });
          if (!arrangement) {
            await tx.insert(arrangements).values({
              date: dayChange.date,
            });
          }
          for (let i = 0; i < dayChange.songOrder.length; i++) {
            const songId = dayChange.songOrder[i];
            if (!songId)
              continue;
            await tx
              .update(songs)
              .set({
                state: "used",
                arrangementDate: dayChange.date,
                position: i + 1,
              })
              .where(eq(songs.id, songId));
          }
        }
      });
      await invalidateArrangementCache();
    }),

  listSafe: protectedProcedure.query(async () => {
    const cacheKey = "arrangement:listSafe:stable";
    const cached = await cacheGet(cacheKey);

    let arrangementsData;
    if (cached) {
      consola.info(`${new Date().toLocaleString()} Redis 缓存命中：${cacheKey}`);
      arrangementsData = JSON.parse(cached);
    } else {
      const Ago = new Date();
      Ago.setDate(Ago.getDate() - 90);
      const AgoString = Ago.toISOString().split("T")[0]!;

      arrangementsData = await db.query.arrangements.findMany({
        orderBy: desc(arrangements.date),
        where: gte(arrangements.date, AgoString),
        columns: {
          date: true,
        },
        with: {
          songs: {
            orderBy: order,
            columns: {
              id: true,
              creator: true,
              ownerDisplayName: true,
              name: true,
              songId: true,
              source: true,
              imgId: true,
              duration: true,
              msgPublic: true,
              createdAt: true,
            },
          },
        },
      });

      await cacheSet(cacheKey, JSON.stringify(arrangementsData), { EX: 86400 });
      consola.info(`${new Date().toLocaleString()} Redis 缓存写入：${cacheKey}`);
    }

    // 易变字段（点赞、状态、未播放数等）不缓存，每次实时读取并合并
    const songIds = arrangementsData.flatMap((a: { songs: { id: number }[] }) =>
      a.songs.map((s: { id: number }) => s.id),
    );
    const volatileMap = await getVolatileSongMap(songIds);
    const dates = arrangementsData.map((a: { date: string }) => a.date);
    const arrangementVolatileMap = await getArrangementVolatileMap(dates);

    const likerIds = [
      ...new Set(
        arrangementsData.flatMap((a: { songs: { id: number }[] }) =>
          a.songs.flatMap((s: { id: number }) => volatileMap.get(s.id)?.likes ?? []),
        ),
      ),
    ] as string[];
    const likers = likerIds.length
      ? await db.query.users.findMany({
        where: inArray(users.id, likerIds),
        columns: { id: true, displayName: true, name: true },
      })
      : [];
    const likerMap = new Map(likers.map(u => [u.id, u]));

    return arrangementsData.map((arrangement: { date: string; songs: { id: number }[] }) => {
      const arrangementVolatile = arrangementVolatileMap.get(arrangement.date) ?? {
        status: "pending",
      };
      return {
        ...arrangement,
        status: arrangementVolatile.status,
        songs: arrangement.songs.map((song: { id: number }) => {
          const volatile = volatileMap.get(song.id);
          return {
            ...song,
            ...volatile,
            likeUsers:
              volatile?.likes.map(id => likerMap.get(id)?.displayName || likerMap.get(id)!.name)
              ?? [],
          };
        }),
      };
    });
  }),

  listGuest: publicProcedure.query(async () => {
    const cacheKey = "arrangement:listGuest:stable";
    const cached = await cacheGet(cacheKey);

    let arrangementsData;
    if (cached) {
      consola.info(`${new Date().toLocaleString()} Redis 缓存命中：${cacheKey}`);
      arrangementsData = JSON.parse(cached);
    } else {
      const Ago = new Date();
      Ago.setDate(Ago.getDate() - 7);
      const AgoString = Ago.toISOString().split("T")[0]!;

      arrangementsData = await db.query.arrangements.findMany({
        orderBy: desc(arrangements.date),
        where: gte(arrangements.date, AgoString),
        columns: { date: true },
        with: {
          songs: {
            orderBy: order,
            columns: {
              id: true,
              creator: true,
              name: true,
              imgId: true,
              source: true,
              duration: true,
              createdAt: true,
            },
          },
        },
      });

      await cacheSet(cacheKey, JSON.stringify(arrangementsData), { EX: 86400 });
      consola.info(`${new Date().toLocaleString()} Redis 缓存写入：${cacheKey}`);
    }

    // 易变字段（点赞数、状态等）不缓存，每次实时读取并合并
    const songIds = arrangementsData.flatMap((a: { songs: { id: number }[] }) =>
      a.songs.map((s: { id: number }) => s.id),
    );
    const volatileMap = await getVolatileSongMap(songIds);
    const dates = arrangementsData.map((a: { date: string }) => a.date);
    const arrangementVolatileMap = await getArrangementVolatileMap(dates);

    return arrangementsData.map((arrangement: { date: string; songs: { id: number }[] }) => {
      const arrangementVolatile = arrangementVolatileMap.get(arrangement.date) ?? {
        status: "pending",
      };
      return {
        ...arrangement,
        status: arrangementVolatile.status,
        songs: arrangement.songs.map((song: { id: number }) => ({
          ...song,
          state: volatileMap.get(song.id)?.state,
          likeCount: volatileMap.get(song.id)?.likeCount ?? 0,
        })),
      };
    });
  }),

  stats: adminProcedure.use(requirePermission(["arrange"])).query(async () => {
    const approvedCount = await db
      .select({ count: count() })
      .from(songs)
      .where(eq(songs.state, "approved"));
    const pendingCount = await db
      .select({ count: count() })
      .from(songs)
      .where(eq(songs.state, "pending"));
    const droppedCount = await db
      .select({ count: count() })
      .from(songs)
      .where(eq(songs.state, "dropped"));
    const missedCount = await db
      .select({ count: count() })
      .from(songs)
      .where(eq(songs.state, "missed"));
    const failedCount = await db
      .select({ count: count() })
      .from(songs)
      .where(eq(songs.state, "failed"));

    return {
      approved: approvedCount[0]?.count ?? 0,
      pending: pendingCount[0]?.count ?? 0,
      dropped: droppedCount[0]?.count ?? 0,
      missed: missedCount[0]?.count ?? 0,
      failed: failedCount[0]?.count ?? 0,
    };
  }),

  arrange: adminProcedure
    .use(requirePermission(["arrange"]))
    .input(
      z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        songCount: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      const start = parseDate(input.start);
      const end = parseDate(input.end);

      if (end.compare(start) < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "结束日期不能早于开始日期",
        });
      }

      const {
        plan,
        candidateRows,
        originalById,
        fixedByDay,
        fillableDates,
        frozenDates,
        rangeDates,
      } = await assembleArrange({
        start: input.start,
        end: input.end,
        songCount: input.songCount,
      });

      if (fillableDates.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "区间内没有可排歌的日期（日期已早于今天、当天已播放或排期已锁定）",
        });
      }
      // 没有候选歌曲时直接返回，避免把区间内的排期整片清空
      if (candidateRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "没有歌曲可播放",
        });
      }

      const placedDate = new Map<number, string>();
      for (const [date, ids] of Object.entries(plan.assignments)) {
        for (const id of ids)
          placedDate.set(id, date);
      }

      await db.transaction(async (tx) => {
        for (const date of fillableDates) {
          const ids = plan.assignments[date] ?? [];
          if (ids.length === 0)
            continue;

          const arrangementRow = await tx.query.arrangements.findFirst({
            where: eq(arrangements.date, date),
            columns: { date: true },
          });
          if (!arrangementRow)
            await tx.insert(arrangements).values({ date });

          // 播放顺序：跳过当天固定占用（played 等）已占用的编号，避免同一天出现重复 position
          const usedSlots = new Set(
            (fixedByDay.get(date) ?? [])
              .map(fixed => originalById.get(fixed.id)?.position)
              .filter((position): position is number => typeof position === "number"),
          );
          let next = 1;
          for (const id of ids) {
            while (usedSlots.has(next))
              next += 1;
            const position = next;
            usedSlots.add(position);
            next += 1;

            const original = originalById.get(id);
            if (!original)
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `排歌结果包含未知歌曲 #${id}` });
            // 排入即待播：统一记为 used，歌曲随之离开待排池
            const state = "used";
            if (original.arrangementDate === date && original.position === position && original.state === state)
              continue;

            await tx
              .update(songs)
              .set({ arrangementDate: date, position, state })
              .where(eq(songs.id, id));
          }
        }

        // 未排上（落选 / 被挤出）：退回待排池。
        // 原本是待排池状态（missed/failed/approved/dropped）的保持不变，欠播优先级不丢；
        // 原本已排期（used）的退回 approved，避免出现「used 却没有排期」的悬空状态。
        for (const id of plan.dropped) {
          const original = originalById.get(id);
          if (!original)
            continue;
          const state = original.state === "used" ? "approved" : original.state;
          const clearDate = original.arrangementDate !== null;
          const changeState = original.state !== state;
          if (!clearDate && !changeState)
            continue;
          await tx
            .update(songs)
            .set({
              ...(clearDate ? { arrangementDate: null, position: null } : {}),
              ...(changeState ? { state } : {}),
            })
            .where(eq(songs.id, id));
        }

        // 区间内最终没有成员、也没有任何歌曲引用的日期：删除残留的排期行。
        // 区间外的日期一律不动。
        for (const date of rangeDates) {
          if ((plan.assignments[date]?.length ?? 0) > 0)
            continue;
          const referenced = await tx.query.songs.findFirst({
            where: eq(songs.arrangementDate, date),
            columns: { id: true },
          });
          if (referenced)
            continue;
          await tx.delete(arrangements).where(eq(arrangements.date, date));
        }
      });

      await invalidateArrangementCache();
      await cacheDel("songMap");

      const placedCount = [...placedDate.keys()]
        .filter(id => !originalById.get(id)?.arrangementDate)
        .length;

      return {
        placedCount,
        droppedCount: plan.dropped.length,
        evictedCount: plan.evicted.length,
        adjustedCount: plan.adjustments.length,
        frozenDays: frozenDates,
        conflicts: plan.adjustments.map(adjustment => ({
          songId: adjustment.songId,
          expectedDate: adjustment.expectedDate,
          actualDate: adjustment.actualDate,
          reason: adjustment.reason,
        })),
      };
    }),

  getArrangement: protectedProcedure
    .use(requirePermission(["robot"]))
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
      }),
    )
    .query(async ({ input }) => {
      return await db.query.arrangements.findFirst({
        where: eq(arrangements.date, input.date),
        columns: {
          date: true,
        },
        with: {
          songs: {
            orderBy: [asc(songs.position), desc(songs.createdAt)],
            columns: {
              id: true,
              creator: true,
              name: true,
              songId: true,
              source: true,
              imgId: true,
              message: true,
              msgPublic: true,
              rejectMessage: true,
              duration: true,
              createdAt: true,
              position: true,
              state: true,
              likeCount: true,
              ownerDisplayName: true,
              isRealName: true,
            },
          },
        },
      });
    }),
  listRange: protectedProcedure
    .use(requirePermission(["robot"]))
    .input(
      z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
      }),
    )
    .query(async ({ input }) => {
      if (input.end < input.start) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "结束日期不能早于开始日期",
        });
      }

      return await db.query.arrangements.findMany({
        where: and(gte(arrangements.date, input.start), lte(arrangements.date, input.end)),
        orderBy: asc(arrangements.date),
        columns: {
          date: true,
          status: true,
        },
        with: {
          songs: {
            orderBy: order,
            columns: {
              id: true,
              state: true,
              position: true,
            },
          },
        },
      });
    }),
  today: publicProcedure.query(async () => {
    const today = new Date().toISOString().split("T")[0]!;
    const arrangement = await db.query.arrangements.findFirst({
      where: eq(arrangements.date, today),
      columns: {
        date: true,
      },
      with: {
        songs: {
          orderBy: [asc(songs.position), desc(songs.createdAt)],
          columns: {
            id: true,
            creator: true,
            name: true,
            songId: true,
            source: true,
            imgId: true,
            duration: true,
            ownerDisplayName: true,
            message: true,
            position: true,
          },
        },
      },
    });

    return arrangement;
  }),

  hasPlayed: protectedProcedure
    .use(requirePermission(["robot"]))
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        songs: z.array(z.number().int().positive()).min(1, "歌曲列表不能为空"),
        hasPlayed: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      // hasPlayed 为 true 时表示当天尝试了播放歌曲，但是有部分歌曲播放失败，有部分歌曲播放成功，这里上传的songs是播放失败的歌曲，成功的歌曲不会上传。
      // hasPlayed 为 false 时表示当天没有播放歌曲，全部歌曲都需要标记为missed，不用考虑传入的songs，直接从数据库中获取。
      const monitorHasPlayed = getConfig("monitorHasPlayed");
      if (!monitorHasPlayed) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "监控是否完成放歌任务未开启，无法处理请求",
        });
      }
      const { date, songs: songIds, hasPlayed } = input;
      // if (!(await verifyHasPlayedToken(token))) {
      //   throw new TRPCError({
      //     code: "UNAUTHORIZED",
      //     message: "Token 验证失败",
      //   });
      // }
      if (songIds.length === 0) {
        return {
          success: true,
          count: 0,
          processedIds: [],
          notFoundIds: [],
          message: "歌曲列表为空，未处理任何歌曲",
        };
      }

      const arrangement = await db.query.arrangements.findFirst({
        where: eq(arrangements.date, date),
        columns: { date: true },
      });

      if (!arrangement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `指定日期 ${date} 的排歌记录不存在`,
        });
      }

      if (!hasPlayed) {
        // 当天没有播放歌曲，将当天所有歌曲标记为 missed，保留在排期列表（不从列表中删除），后续排歌仍以 missed 最高优先级处理
        const usedSongs = await db.query.songs.findMany({
          where: eq(songs.arrangementDate, date),
          columns: {
            id: true,
          },
        });
        if (usedSongs.length > 0) {
          await db
            .update(songs)
            .set({ state: "missed" })
            .where(eq(songs.arrangementDate, date));
        }
        await db
          .update(arrangements)
          .set({ status: "missed" })
          .where(eq(arrangements.date, date));
        await invalidateArrangementCache();
        await cacheDel("songMap");
        return {
          success: true,
          count: usedSongs.length,
          processedIds: usedSongs.map(s => s.id),
          notFoundIds: [],
          message: `成功将 ${usedSongs.length} 首歌曲标记为未播放，保留在排期列表中`,
        };
      }

      // 当天尝试播放：上传的 songs 为播放失败的歌曲，标记为 failed（保留在排期列表中）
      const matchingSongs = await db.query.songs.findMany({
        where: and(eq(songs.arrangementDate, date), inArray(songs.id, songIds)),
        columns: { id: true },
      });

      const foundIds = matchingSongs.map(s => s.id);
      const notFoundIds = songIds.filter(id => !foundIds.includes(id));

      if (foundIds.length === 0) {
        return {
          success: true,
          count: 0,
          processedIds: [],
          notFoundIds,
          message: "未在当天的排歌记录中找到需要处理的歌曲",
        };
      }

      await db
        .update(songs)
        .set({ state: "failed" })
        .where(inArray(songs.id, foundIds));

      // 成功播放：当天其余仍为 used 的歌曲视为播放成功，标记为 played（保留在排期列表中）
      const playedSongs = await db.query.songs.findMany({
        where: and(eq(songs.arrangementDate, date), eq(songs.state, "used")),
        columns: { id: true },
      });
      if (playedSongs.length > 0) {
        await db
          .update(songs)
          .set({ state: "played" })
          .where(inArray(songs.id, playedSongs.map(s => s.id)));
      }

      await db
        .update(arrangements)
        .set({ status: "failed" })
        .where(eq(arrangements.date, date));

      await invalidateArrangementCache();
      await cacheDel("songMap");

      return {
        success: true,
        count: foundIds.length,
        processedIds: foundIds,
        playedIds: playedSongs.map(s => s.id),
        notFoundIds,
        message: `成功将 ${foundIds.length} 首歌曲标记为播放失败，${playedSongs.length} 首歌曲标记为已播放`,
      };
    }),

  finish: protectedProcedure
    .use(requirePermission(["robot"]))
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
      }),
    )
    .mutation(async ({ input }) => {
      const monitorHasPlayed = getConfig("monitorHasPlayed");
      if (!monitorHasPlayed) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "监控是否完成放歌任务未开启，无法处理请求",
        });
      }
      const arrangement = await db.query.arrangements.findFirst({
        where: eq(arrangements.date, input.date),
        columns: { date: true },
      });
      if (!arrangement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `指定日期 ${input.date} 的排歌记录不存在`,
        });
      }
      // 将当天仍为 used 的歌曲标记为 played（视为全部播放完成）
      await db
        .update(songs)
        .set({ state: "played" })
        .where(and(eq(songs.arrangementDate, input.date), eq(songs.state, "used")));
      await db
        .update(arrangements)
        .set({ status: "success" })
        .where(eq(arrangements.date, input.date));
      await invalidateArrangementCache();
      await cacheDel("songMap");
      return {
        success: true,
        date: input.date,
        message: `成功将 ${input.date} 标记为全部播放完成`,
      };
    }),

  recover: protectedProcedure
    .use(requirePermission(["robot"]))
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        songIds: z.array(z.number()).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const monitorHasPlayed = getConfig("monitorHasPlayed");
      if (!monitorHasPlayed) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "监控是否完成放歌任务未开启，无法处理请求",
        });
      }
      const arrangement = await db.query.arrangements.findFirst({
        where: eq(arrangements.date, input.date),
        columns: { date: true },
      });
      if (!arrangement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `指定日期 ${input.date} 的排歌记录不存在`,
        });
      }

      // 恢复重试后重新下载成功的歌曲到当天（仅当未被安排到其他日期）
      const restorable = await db.query.songs.findMany({
        where: inArray(songs.id, input.songIds),
        columns: { id: true, arrangementDate: true },
      });
      const restoredIds = restorable
        .filter(s => s.arrangementDate === null || s.arrangementDate === input.date)
        .map(s => s.id);
      if (restoredIds.length > 0) {
        await db
          .update(songs)
          .set({ state: "used", arrangementDate: input.date })
          .where(inArray(songs.id, restoredIds));
      }

      // 统计当天仍为 failed/missed 的歌曲；若全部恢复则标记为 success，否则保持 failed
      const remainingUnplayed = await db.query.songs.findMany({
        where: and(
          eq(songs.arrangementDate, input.date),
          inArray(songs.state, ["failed", "missed"]),
        ),
        columns: { id: true },
      });
      const status = remainingUnplayed.length === 0 ? "success" : "failed";
      await db
        .update(arrangements)
        .set({ status })
        .where(eq(arrangements.date, input.date));
      await invalidateArrangementCache();
      await cacheDel("songMap");
      return {
        success: true,
        date: input.date,
        restored: restoredIds.length,
        unplayedSongs: remainingUnplayed.length,
        status,
      };
    }),

  delete: adminProcedure
    .use(requirePermission(["arrange", "deleteArrangement"]))
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
      }),
    )
    .mutation(async ({ input }) => {
      await deleteArrangement(input.date);
    }),
});
