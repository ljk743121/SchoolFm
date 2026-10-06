import type { ArrangeSongState } from "~~/server/utils/arrange";
import type { TMediaSource, TSubmitType } from "~~/types";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { MAX_DAILY_SONG_DURATION, START_TIME } from "~~/constants";
import { db } from "~~/server/db";
import { arrangements, songs, users } from "~~/server/db/schema";
import { cacheDel, cacheGet, cacheSet } from "~~/server/utils/redis";
import { getVolatileSongMap, STABLE_SONG_COLUMNS } from "~~/server/utils/songCache";
import { hasBlockWord } from "~~/server/utils/universal";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  requirePermission,
  router,
} from "../trpc";
import { invalidateArrangementCache } from "./arrangements";
import { fitsInTime } from "./time";

function getISOWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

async function checkCanSubmit(remainSongs: number) {
  if (!(await fitsInTime(new Date())))
    return false;
  return remainSongs > 0;
}

// 将歌曲按期望播放日期自动安排进度表；无法安排（超时/空间不足）时保持 approved 状态
// 复用排歌核心算法（server/utils/arrange），保证与自动排歌同一套优先级与容量规则
async function arrangeSongOnDate(song: {
  id: number;
  duration: number | null;
  expectedPlayDate: string | null;
  createdAt: Date;
}) {
  const date = song.expectedPlayDate;
  if (!date)
    return;

  const existingRows = await db.query.songs.findMany({
    where: eq(songs.arrangementDate, date),
    columns: {
      id: true,
      duration: true,
      expectedPlayDate: true,
      createdAt: true,
      state: true,
      position: true,
    },
  });

  const { isMoveableState, localToday, planArrangement } = await import("~~/server/utils/arrange");

  // 已播放（played）等不可移动的歌曲只占容量，不参与竞争
  const moveableRows = existingRows.filter(
    (row): row is typeof row & { state: ArrangeSongState } => isMoveableState(row.state),
  );
  const fixedRows = existingRows.filter(row => !isMoveableState(row.state));
  const plan = planArrangement({
    start: date,
    end: date,
    today: localToday(),
    maxDailyDuration: MAX_DAILY_SONG_DURATION,
    days: [{
      date,
      fixed: fixedRows.map(row => ({ id: row.id, duration: row.duration ?? 0 })),
    }],
    songs: [
      ...moveableRows.map(row => ({
        id: row.id,
        duration: row.duration ?? 0,
        expectedPlayDate: row.expectedPlayDate,
        createdAt: row.createdAt,
        state: row.state,
        currentDate: date,
      })),
      {
        id: song.id,
        duration: song.duration ?? 0,
        expectedPlayDate: date,
        createdAt: song.createdAt,
        state: "approved" as const,
        currentDate: null,
      },
    ],
  });

  const assigned = plan.assignments[date] ?? [];

  await db.transaction(async (tx) => {
    if (assigned.length > 0) {
      const arrangementRow = await tx.query.arrangements.findFirst({
        where: eq(arrangements.date, date),
        columns: { date: true },
      });
      if (!arrangementRow)
        await tx.insert(arrangements).values({ date });

      // 播放顺序：跳过不可移动歌曲已占用的编号
      const usedSlots = new Set(
        fixedRows
          .map(row => row.position)
          .filter((position): position is number => typeof position === "number"),
      );
      let next = 1;
      for (const id of assigned) {
        while (usedSlots.has(next))
          next += 1;
        const position = next;
        usedSlots.add(position);
        next += 1;
        await tx
          .update(songs)
          .set({ state: "used", arrangementDate: date, position })
          .where(eq(songs.id, id));
      }
    } else {
      // 当天已排满且挤不动：保持 approved，不排入
      await tx
        .update(songs)
        .set({ state: "approved", arrangementDate: null, position: null })
        .where(eq(songs.id, song.id));
    }

    // 被挤出当天排期的歌曲回到待排池
    const evictedIds = plan.evicted
      .filter(eviction => eviction.to === null)
      .map(eviction => eviction.songId)
      .filter(id => id !== song.id);
    if (evictedIds.length > 0) {
      await tx
        .update(songs)
        .set({ state: "approved", arrangementDate: null, position: null })
        .where(inArray(songs.id, evictedIds));
    }
  });

  await invalidateArrangementCache();
}

export const songRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "请输入歌名").max(128, "歌名长度最大为128"),
        creator: z.string().min(1, "请输入歌手名").max(128, "歌手长度最大128"),
        songId: z.string({ required_error: "请输入歌曲ID" }).optional(),
        source: z.custom<TMediaSource>(),
        imgId: z.string(),
        duration: z.number().positive().min(30, "歌曲长度最小为30秒").max(60 * 10, "歌曲长度最大为10分钟"),
        submitType: z.custom<TSubmitType>(),
        expectedPlayDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
          .optional(),
        message: z.string().trim().optional(),
        msgPublic: z.string().trim().optional(),
        customUrl: z.string().trim().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await checkCanSubmit(ctx.user.remainSubmitSongs))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "您的剩余提交次数为0,请等5天后重置",
        });
      }

      const content = `${input.message || ""} ${input.msgPublic || ""}`;
      const blockWords = await hasBlockWord(content);
      if (blockWords.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `投稿失败，含有违禁词"${blockWords.join(",")}"` });
      }

      let isRealName = false;
      let displayName = ctx.user.displayName;
      if (input.submitType === "realName") {
        isRealName = true;
        displayName = ctx.user.name!;
      } else if (input.submitType === "anonymous") {
        displayName = "";
      }
      let songId = input.songId ? input.songId.toString() : "";
      if (input.source === "custom") {
        if (!input.customUrl)
          throw new TRPCError({ code: "BAD_REQUEST", message: "请填写歌曲链接" });
        songId = input.customUrl;
      }
      if (!songId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请输入歌曲ID" });
      }
      const now = new Date();
      await db.insert(songs).values({
        ...input,
        songId,
        ownerId: ctx.user.id,
        isRealName,
        ownerDisplayName: displayName,
        expectedPlayDate: input.expectedPlayDate,
        createdAt: now,
      });
      await db
        .update(users)
        .set({
          remainSubmitSongs: ctx.user.remainSubmitSongs - 1,
          lastSubmitAt: now,
        })
        .where(eq(users.id, ctx.user.id));
      await cacheDel(`listMine:stable:${ctx.user.id}`);
    }),
  deleteMine: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const song = await db.query.songs.findFirst({
        where: eq(songs.id, input.id),
      });
      if (!song)
        throw new TRPCError({ code: "NOT_FOUND", message: "歌曲不存在" });
      if (song.ownerId !== ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "你不能删除他人的歌曲" });
      if (song.state === "used")
        throw new TRPCError({ code: "BAD_REQUEST", message: "该歌曲已被使用" });
      await db.delete(songs).where(eq(songs.id, input.id));
      await cacheDel(`listMine:stable:${ctx.user.id}`);
    }),
  delete: adminProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .use(requirePermission(["review", "deleteSong"]))
    .mutation(async ({ input }) => {
      const song = await db.query.songs.findFirst({
        where: eq(songs.id, input.id),
      });
      if (!song)
        throw new TRPCError({ code: "NOT_FOUND", message: "歌曲不存在" });
      await db.delete(songs).where(eq(songs.id, input.id));
    }),

  list: adminProcedure.use(requirePermission(["review"])).query(async () => {
    return await db.query.songs.findMany({
      orderBy: desc(songs.createdAt),
    });
  }),

  listReview: adminProcedure.use(requirePermission(["review"])).query(async () => {
    return await db.query.songs.findMany({
      where: eq(songs.state, "pending"),
      orderBy: desc(songs.createdAt),
      columns: {
        id: true,
        name: true,
        creator: true,
        songId: true,
        source: true,
        imgId: true,
        duration: true,
        ownerDisplayName: true,
        isRealName: true,
        message: true,
        expectedPlayDate: true,
        createdAt: true,
        state: true,
        rejectMessage: true,
      },
    });
  }),

  listSafe: protectedProcedure.query(async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);// two weeks
    const rawSongs = await db.query.songs.findMany({
      where: or(
        inArray(songs.state, ["pending", "approved", "dropped", "missed", "failed"]),
        and(
          inArray(songs.state, ["used", "played", "rejected"]),
          gt(songs.createdAt, twoWeeksAgo),
        ),
      ),
      orderBy: [asc(songs.arrangementDate), desc(songs.likeCount), asc(songs.expectedPlayDate), desc(songs.createdAt)],
      columns: {
        id: true,
        name: true,
        creator: true,
        songId: true,
        source: true,
        imgId: true,
        duration: true,
        ownerDisplayName: true,
        isRealName: true,
        state: true,
        likes: true,
        likeCount: true,
        rejectMessage: true,
        arrangementDate: true,
        expectedPlayDate: true,
        createdAt: true,
        msgPublic: true,
      },
    });

    const likerIds = [...new Set(rawSongs.flatMap(s => s.likes))];
    const likers = likerIds.length
      ? await db.query.users.findMany({
        where: inArray(users.id, likerIds),
        columns: { id: true, displayName: true, name: true },
      })
      : [];
    const likerMap = new Map(likers.map(u => [u.id, u]));

    return rawSongs.map(song => ({
      ...song,
      likeUsers: song.likes.map(id => likerMap.get(id)?.displayName || likerMap.get(id)!.name),
    }));
  }),

  listGuest: publicProcedure.query(async () => {
    return await db.query.songs.findMany({
      limit: 5,
      orderBy: [desc(songs.createdAt)],
      columns: {
        id: true,
        name: true,
        creator: true,
        source: true,
        imgId: true,
        state: true,
        likeCount: true,
        rejectMessage: true,
        arrangementDate: true,
        createdAt: true,
        msgPublic: true,
      },
    });
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `listMine:stable:${ctx.user.id}`;
    const cachedList = await cacheGet(cacheKey);

    let list;
    if (cachedList) {
      list = JSON.parse(cachedList);
    } else {
      list = await db.query.songs.findMany({
        orderBy: desc(songs.createdAt),
        where: eq(songs.ownerId, ctx.user.id),
        columns: STABLE_SONG_COLUMNS,
      });
      await cacheSet(cacheKey, JSON.stringify(list), { EX: 86400 });
    }

    // 易变字段（点赞、状态等）不缓存，每次实时读取
    const volatileMap = await getVolatileSongMap(list.map((s: { id: number }) => s.id));
    const likerIds = [...new Set(list.flatMap((s: { id: number }) => volatileMap.get(s.id)?.likes ?? []))] as string[];
    const likers = likerIds.length
      ? await db.query.users.findMany({
        where: inArray(users.id, likerIds),
        columns: { id: true, displayName: true, name: true },
      })
      : [];
    const likerMap = new Map(likers.map(u => [u.id, u]));

    return list.map((song: { id: number }) => {
      const volatile = volatileMap.get(song.id);
      return {
        ...song,
        ...volatile,
        likeUsers: volatile?.likes.map(id => likerMap.get(id)?.displayName || likerMap.get(id)!.name) ?? [],
      };
    });
  }),

  canSubmit: protectedProcedure.query(async ({ ctx }) => {
    return await checkCanSubmit(ctx.user.remainSubmitSongs);
  }),

  // 预估本次投稿能否安排在期望日期当天，并给出预计位置（不写库）
  previewSchedule: protectedProcedure
    .input(
      z.object({
        expectedPlayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
        duration: z.number().positive(),
      }),
    )
    .query(async ({ input }) => {
      const date = input.expectedPlayDate;

      // 项目未配置不可用日期，以下逻辑暂时停用
      /*
      // 不可用日期直接判定无法安排在当天
      const unavailableConfig = await getConfig("unavailableDates");
      let unavailableDates: string[] = [];
      if (unavailableConfig) {
        try {
          const parsed = JSON.parse(unavailableConfig);
          if (Array.isArray(parsed))
            unavailableDates = parsed.map(String);
        } catch {
          // 忽略配置解析错误
        }
      }
      if (unavailableDates.includes(date)) {
        return {
          canSchedule: false,
          reason: "unavailable" as const,
          scheduledDate: null,
          position: null,
          daySongCount: 0,
          dayDuration: 0,
          remainingSeconds: 0,
          playTime: null,
        };
      }
      */

      // 当天已排歌曲
      const arrangement = await db.query.arrangements.findFirst({
        where: eq(arrangements.date, date),
        with: {
          songs: {
            columns: { id: true, duration: true, expectedPlayDate: true, createdAt: true },
          },
        },
      });
      const occupied = new Map<number, { id: number; duration: number; expectedPlayDate: string | null; createdAt: Date }>();
      for (const s of arrangement?.songs ?? []) {
        occupied.set(s.id, {
          id: s.id,
          duration: s.duration ?? 0,
          expectedPlayDate: s.expectedPlayDate,
          createdAt: s.createdAt,
        });
      }

      // 同日期但尚未排期的歌曲：审核通过后也会落到同一天，需计入竞争
      const competing = await db.query.songs.findMany({
        where: and(
          inArray(songs.state, ["approved", "missed", "failed"]),
          eq(songs.expectedPlayDate, date),
        ),
        columns: { id: true, duration: true, expectedPlayDate: true, createdAt: true },
      });
      for (const s of competing) {
        if (!occupied.has(s.id)) {
          occupied.set(s.id, {
            id: s.id,
            duration: s.duration ?? 0,
            expectedPlayDate: s.expectedPlayDate,
            createdAt: s.createdAt,
          });
        }
      }

      const currentDuration = [...occupied.values()].reduce((sum, s) => sum + s.duration, 0);
      const totalDuration = currentDuration + input.duration;
      const daySongCount = occupied.size + 1;

      // 预计位置：期望日为当天的歌曲排前面（组内按投稿时间升序），其余随后
      const list = [
        ...occupied.values(),
        { id: -1, duration: input.duration, expectedPlayDate: date, createdAt: new Date() },
      ].sort((a, b) => {
        const cmp = Number(b.expectedPlayDate === date) - Number(a.expectedPlayDate === date);
        if (cmp !== 0)
          return cmp;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const position = list.findIndex(s => s.id === -1) + 1;

      // 预计播放时间：从每天开始播放时间起，累加前面所有歌曲的时长
      const precedingDuration = list
        .slice(0, position - 1)
        .reduce((sum, s) => sum + s.duration, 0);
      const [startHour, startMinute] = START_TIME.split(":").map(Number);
      const startSeconds = (startHour ?? 0) * 3600 + (startMinute ?? 0) * 60;
      const playSeconds = startSeconds + precedingDuration;
      const playTime = `${String(Math.floor(playSeconds / 3600) % 24).padStart(2, "0")}:${String(Math.floor((playSeconds % 3600) / 60)).padStart(2, "0")}`;

      if (totalDuration > MAX_DAILY_SONG_DURATION) {
        return {
          canSchedule: false,
          reason: "full" as const,
          scheduledDate: null,
          position: null,
          daySongCount,
          dayDuration: totalDuration,
          remainingSeconds: Math.max(0, MAX_DAILY_SONG_DURATION - currentDuration),
          playTime: null,
        };
      }

      return {
        canSchedule: true,
        reason: null,
        scheduledDate: date,
        position,
        daySongCount,
        dayDuration: totalDuration,
        remainingSeconds: MAX_DAILY_SONG_DURATION - totalDuration,
        playTime,
      };
    }),

  remainSubmitSongs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.remainSubmitSongs === ctx.user.maxSubmitSongs) {
      return ctx.user.maxSubmitSongs;
    }

    // Check if it's a new week
    if (getISOWeekNumber(new Date()) - getISOWeekNumber(ctx.user.lastLoginAt) >= 1) {
      await db
        .update(users)
        .set({
          remainSubmitSongs: ctx.user.maxSubmitSongs,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));
      return ctx.user.maxSubmitSongs;
    }

    // Check if user have submitted songs in the last 5 days
    if (Date.now() - ctx.user.lastSubmitAt.getTime() >= 5 * 24 * 60 * 60 * 1000) {
      await db
        .update(users)
        .set({
          remainSubmitSongs: ctx.user.maxSubmitSongs,
        })
        .where(eq(users.id, ctx.user.id));
      return ctx.user.maxSubmitSongs;
    }

    return ctx.user.remainSubmitSongs;
  }),

  vote: protectedProcedure.input(z.number()).mutation(async ({ input: id, ctx }) => {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, id),
    });
    if (!song)
      throw new TRPCError({ code: "NOT_FOUND", message: "歌曲不存在" });
    if (song.likes.includes(ctx.user.id))
      throw new TRPCError({ code: "BAD_REQUEST", message: "您已点过赞" });
    await db
      .update(songs)
      .set({
        likes: [...song.likes, ctx.user.id],
        likeCount: song.likeCount + 1,
      })
      .where(eq(songs.id, id));
    // 点赞数属于易变字段，listMine 已不缓存该部分，无需失效缓存
  }),

  disvote: protectedProcedure.input(z.number()).mutation(async ({ input: id, ctx }) => {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, id),
    });
    if (!song)
      throw new TRPCError({ code: "NOT_FOUND", message: "歌曲不存在" });
    if (!song.likes.includes(ctx.user.id))
      throw new TRPCError({ code: "BAD_REQUEST", message: "您没有点赞此歌曲" });
    await db
      .update(songs)
      .set({
        likes: song.likes.filter(like => like !== ctx.user.id),
        likeCount: song.likeCount - 1,
      })
      .where(eq(songs.id, id));
    // 点赞数属于易变字段，listMine 已不缓存该部分，无需失效缓存
  }),

  idToName: protectedProcedure.input(z.array(z.string())).query(async ({ input }) => {
    const list = [];
    for (const id of input) {
      list.push((await getUserDetailById(id)).name);
    }
    return list;
  }),

  review: router({
    approve: adminProcedure
      .input(
        z.object({
          id: z.number(),
        }),
      )
      .use(requirePermission(["review"]))
      .mutation(async ({ input }) => {
        // check if song exists and is pending
        const song = await db.query.songs.findFirst({
          where: eq(songs.id, input.id),
          columns: {
            id: true,
            state: true,
            duration: true,
            expectedPlayDate: true,
            createdAt: true,
          },
        });
        if (!song)
          throw new TRPCError({ code: "NOT_FOUND", message: "歌曲不存在" });
        if (song.state !== "pending")
          throw new TRPCError({ code: "BAD_REQUEST", message: "歌曲已被审核" });
        // if hasn't expectedPlayDate, just approve it
        if (!song.expectedPlayDate) {
          await db.update(songs).set({ state: "approved" }).where(eq(songs.id, input.id));
          return;
        }
        // if has expectedPlayDate
        await arrangeSongOnDate(song);
      }),

    reject: adminProcedure
      .input(
        z.object({
          id: z.number(),
          rejectMessage: z.string().min(4, "拒绝理由不得小于4个字符"),
        }),
      )
      .use(requirePermission(["review"]))
      .mutation(async ({ input }) => {
        await db
          .update(songs)
          .set({
            state: "rejected",
            rejectMessage: input.rejectMessage,
          })
          .where(eq(songs.id, input.id));
      }),

    acceptAll: adminProcedure.use(requirePermission(["review"])).mutation(async () => {
      const pendingSongs = await db.query.songs.findMany({
        where: eq(songs.state, "pending"),
        columns: {
          id: true,
          duration: true,
          expectedPlayDate: true,
          createdAt: true,
        },
      });

      // 无期望播放日期的直接通过
      const dailyFreeSongs = pendingSongs.filter(s => !s.expectedPlayDate);
      if (dailyFreeSongs.length) {
        await db
          .update(songs)
          .set({ state: "approved" })
          .where(inArray(songs.id, dailyFreeSongs.map(s => s.id)));
      }

      // 有期望播放日期的按日期与今天接近程度排序后再安排，越接近今天优先级越高
      const nowDate = new Date();
      const today = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;
      const datedSongs = pendingSongs
        .filter(s => s.expectedPlayDate)
        .sort((a, b) => {
          const diffA = Math.abs(Date.parse(a.expectedPlayDate!) - Date.parse(today));
          const diffB = Math.abs(Date.parse(b.expectedPlayDate!) - Date.parse(today));
          if (diffA !== diffB)
            return diffA - diffB;
          return a.expectedPlayDate! < b.expectedPlayDate! ? -1 : a.expectedPlayDate! > b.expectedPlayDate! ? 1 : 0;
        });
      for (const s of datedSongs) {
        await arrangeSongOnDate(s);
      }
    }),
  }),
});
