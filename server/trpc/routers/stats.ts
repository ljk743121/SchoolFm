import type { TSongState } from "~~/types";
import { consola } from "consola";
import { count } from "drizzle-orm";
import { db } from "~~/server/db";
import { songs, users } from "~~/server/db/schema";
import { cacheGet, cacheSet } from "~~/server/utils/redis";
import { adminProcedure, protectedProcedure, router } from "../trpc";

/** 各状态计数初始值；键必须覆盖 TSongState 全部取值 */
const EMPTY_STATE_COUNT: { [key in TSongState]: number } = {
  pending: 0,
  approved: 0,
  rejected: 0,
  used: 0,
  played: 0,
  dropped: 0,
  missed: 0,
  failed: 0,
};

async function getSongMap() {
  const cacheKey = "songMap";
  const cached = await cacheGet(cacheKey);

  if (cached) {
    const cachedData = JSON.parse(cached);
    const map = new Map<string, { [key in TSongState]: number }>(
      cachedData.map as [string, { [key in TSongState]: number }][],
    );
    return { songs: cachedData.songs, map };
  }

  const songs = await db.query.songs.findMany({
    columns: {
      createdAt: true,
      state: true,
    },
  });

  const map = new Map<string, { [key in TSongState]: number }>();
  for (const song of songs) {
    const date = song.createdAt.toLocaleDateString("zh-CN");
    const val = map.get(date) ?? { ...EMPTY_STATE_COUNT };
    val[song.state]++;
    map.set(date, val);
  }

  await cacheSet(cacheKey, JSON.stringify({ songs, map: Array.from(map.entries()) }), {
    EX: 86400,
  });

  consola.info(`${new Date().toLocaleString()} Redis 缓存写入: ${cacheKey}`);

  return { songs, map };
}

function splitSingerNames(creator: string): string[] {
  const results: string[] = [];
  const parenthesesRegex = /([^(（]*)[(（]([^)）]*)[)）]/;
  const match = creator.match(parenthesesRegex);

  if (match) {
    const outer = (match[1] ?? "").trim();
    const inner = (match[2] ?? "").trim();

    if (outer) {
      results.push(outer);
    }
    if (inner) {
      results.push(inner);
    }
    // seems if it has a secondary name, it's probably not a group of singers
  } else {
    creator.split(/, |；|;|\//).forEach((part) => {
      const trimmed = part.trim();
      if (trimmed)
        results.push(trimmed);
    });
  }

  return results;
}

export const statsRouter = router({
  dashboard: adminProcedure.query(async () => {
    const userCount = (await db.select({ count: count() }).from(users))[0]?.count;

    const { songs, map } = await getSongMap();

    return {
      songCount: songs.length,
      userCount,
      chart: Array.from(map, ([date, count]) => ({ date, ...count })).toSorted(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    };
  }),
  count: protectedProcedure.query(async () => {
    const userCount = (await db.select({ count: count() }).from(users))[0]?.count;
    const songCount = (await db.select({ count: count() }).from(songs))[0]?.count;

    return {
      userCount,
      songCount,
    };
  }),

  song: protectedProcedure.query(async () => {
    const { map } = await getSongMap();
    return Array.from(map, ([date, count]) => ({
      date,
      count:
        count.approved + count.used + count.dropped + count.missed + count.pending + count.rejected,
    }))
      .toSorted((b, a) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 14);
  }),

  singer: protectedProcedure.query(async () => {
    const singers = await db.query.songs.findMany({
      columns: {
        creator: true,
      },
    });

    const map = new Map<string, number>();
    for (const singer of singers) {
      if (!singer.creator)
        continue;
      const creators = splitSingerNames(singer.creator);

      for (const creator of creators) {
        const trimmedCreator = creator.trim();
        if (!trimmedCreator)
          continue;

        const count = map.get(trimmedCreator) ?? 0;
        map.set(trimmedCreator, count + 1);
      }
    }

    return Array.from(map, ([name, count]) => ({ name, count }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, 10);
  }),

  like: protectedProcedure.query(async () => {
    const songs = await db.query.songs.findMany({
      columns: {
        name: true,
        imgId: true,
        source: true,
        likeCount: true,
      },
    });

    const map = new Map<string, { count: number; source: string | null; imgId: string | null }>();
    for (const song of songs) {
      if (song.likeCount <= 0)
        continue;
      const likes = song.likeCount;
      const existing = map.get(song.name);
      const newCount = (existing?.count ?? 0) + likes;
      map.set(song.name, {
        count: newCount,
        source: existing?.source ?? song.source ?? null,
        imgId: existing?.imgId ?? song.imgId ?? null,
      });
    }
    return Array.from(map, ([name, data]) => ({ name, ...data }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, 10);
  }),
});
