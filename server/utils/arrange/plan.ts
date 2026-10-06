/**
 * 排歌主流程（IDEA.md）
 *
 * 按天贪心，分两轮：
 *   阶段 1 · 期望日落位：日期升序，把「期望日 = d」的歌曲按 state/createdAt 排位后贪婪填入 d；
 *   阶段 2 · 剩余容量填充：日期升序，把剩余歌曲按「有期望日优先 → 期望日升序 → state/createdAt」
 *            排位后填入每天剩下的容量；只接受 e === null 或 e <= d 的歌曲，因此**不会提前播放**。
 *
 * 每轮内部「放不下就跳过，继续尝试位次更靠后的歌」（§3 规则 5）；
 * 当天原有的未播放歌曲与新歌同池竞争，位次低者自然被挤出（§4），其 state 保持不变（只解除排期）。
 */

import type { ArrangeDayLoad } from "./fill";
import type {
  ArrangeAdjustment,
  ArrangePlanInput,
  ArrangePlanResult,
  ArrangeSong,
} from "./types";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { fillDay } from "./fill";
import { compareFill, compareHome, comparePlayOrder } from "./priority";

/** 固定占用计入当天负载 */
function loadOfFixed(fixed: { id: number; duration: number }[]): ArrangeDayLoad {
  return {
    duration: fixed.reduce((sum, song) => sum + song.duration, 0),
    count: fixed.length,
    ids: fixed.map(song => song.id),
  };
}

function reasonOf(song: ArrangeSong, fillableDates: Set<string>, today: string) {
  const expected = song.expectedPlayDate!;
  if (expected < today)
    return "past" as const;
  if (!fillableDates.has(expected))
    return "frozen" as const;
  return "full" as const;
}

export function planArrangement(input: ArrangePlanInput): ArrangePlanResult {
  const capacity = {
    maxDuration: input.maxDailyDuration ?? MAX_DAILY_SONG_DURATION,
    maxSongs: input.maxSongsPerDay ?? 0,
  };
  const days = [...input.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const fillableDates = new Set(days.map(day => day.date));
  const songMap = new Map<number, ArrangeSong>(input.songs.map(song => [song.id, song]));

  const loads = new Map<string, ArrangeDayLoad>(
    days.map(day => [day.date, loadOfFixed(day.fixed ?? [])]),
  );
  const placedDate = new Map<number, string>();

  /** 把 candidates 填入 date，并记录落位结果 */
  const place = (date: string, candidates: ArrangeSong[]) => {
    const load = loads.get(date)!;
    const next = fillDay(load, candidates, capacity);
    loads.set(date, next);
    for (const id of next.ids.slice(load.ids.length))
      placedDate.set(id, date);
  };

  // 阶段 1：期望日正好是当天的歌曲，优先在当天落位
  for (const day of days) {
    const candidates = input.songs
      .filter(song => !placedDate.has(song.id) && song.expectedPlayDate === day.date)
      .sort(compareHome);
    place(day.date, candidates);
  }

  // 阶段 2：剩余容量按优先级填充；e > d 的歌曲不参与，绝不提前播
  for (const day of days) {
    const candidates = input.songs
      .filter(song =>
        !placedDate.has(song.id)
        && (song.expectedPlayDate === null || song.expectedPlayDate <= day.date),
      )
      .sort(compareFill);
    place(day.date, candidates);
  }

  // ---------- 结果归类 ----------
  const assignments: Record<string, number[]> = {};
  const dayDurations: Record<string, number> = {};

  for (const day of days) {
    const load = loads.get(day.date)!;
    if (load.count === 0)
      continue;

    dayDurations[day.date] = load.duration;

    const fixedIds = new Set((day.fixed ?? []).map(song => song.id));
    const movable = load.ids.filter(id => !fixedIds.has(id));
    if (movable.length === 0)
      continue;

    assignments[day.date] = movable.sort((a, b) =>
      comparePlayOrder(songMap.get(a)!, songMap.get(b)!, day.date),
    );
  }

  const dropped = input.songs
    .filter(song => !placedDate.has(song.id))
    .map(song => song.id)
    .sort((a, b) => a - b);

  const evicted = input.songs
    .filter(song => song.currentDate !== null && song.currentDate !== placedDate.get(song.id))
    .map(song => ({
      songId: song.id,
      from: song.currentDate,
      to: placedDate.get(song.id) ?? null,
    }))
    .sort((a, b) => a.songId - b.songId);

  const adjustments: ArrangeAdjustment[] = input.songs
    .filter((song) => {
      const date = placedDate.get(song.id);
      return date !== undefined && song.expectedPlayDate !== null && song.expectedPlayDate !== date;
    })
    .map(song => ({
      songId: song.id,
      expectedDate: song.expectedPlayDate!,
      actualDate: placedDate.get(song.id)!,
      reason: reasonOf(song, fillableDates, input.today),
    }))
    .sort((a, b) => a.songId - b.songId);

  return { assignments, dropped, evicted, adjustments, dayDurations };
}
