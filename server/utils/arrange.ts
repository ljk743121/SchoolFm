/**
 * 歌曲排期核心算法
 *
 * 规则：
 * - 每日播放总时长不超过 maxDailyDuration 秒（默认 45 分钟 = 2700 秒）
 * - 优先级：closeness（期望日期与目标日期的接近度，相同日期最接近）> 状态优先级 > 投稿时间（早投稿优先）
 * - 有期望日期的歌曲优先排到对应日期，状态优先级（missed>approved>dropped>failed）越高越优先占用容量
 * - 期望日期已过（早于程序运行当天，当天不算已过）或已排满无法插入时，自动调整到最近的可用日期
 * - 期望日早于本次排歌区间的歌曲视为欠播，顺延到区间最早可用日补播
 * - 当整个区间已排满时，期望日/欠播歌曲可抢占“无期望日期”的普通歌曲腾位（被抢占者回到待排池）
 * - 每天按排歌优先级重新排序：正好命中当天期望日的歌曲 > 期望日歌曲 > 顺延（欠播）歌曲 > 无期望日期的自由歌曲；同档内按状态优先级与投稿时间
 * - 仍无法安排的歌曲作为冲突返回
 */
// by Kimi-K2.7-Coder
import { MAX_DAILY_SONG_DURATION } from "~~/constants";

export interface ArrangeSong {
  id: number;
  duration: number;
  expectedPlayDate: string | null;
  createdAt: Date;
  /** 排歌优先级，数值越小越优先安排（missed=0，approved=1，dropped=2，failed=3） */
  priority: number;
}

export interface ScheduleConflict {
  songId: number;
  expectedDate: string;
  reason: "full" | "unavailable";
  suggestedDate?: string;
}

export interface ScheduleResult {
  assignments: Record<string, number[]>;
  conflicts: ScheduleConflict[];
  dropped: number[];
  /** 因被欠播/期望日歌曲抢占而移出排期的普通歌曲 id */
  evicted: number[];
}

export interface ScheduleOptions {
  maxDailyDuration?: number;
  unavailableDates?: string[];
  maxSongsPerDay?: number;
  existingAssignments?: Record<string, number[]>;
  existingSongs?: ArrangeSong[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(startStr: string, endStr: string): string[] {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    dates.push(formatDate(d));
  }
  return dates;
}

function sortByPriorityAndCreatedAt(a: ArrangeSong, b: ArrangeSong): number {
  if (a.priority !== b.priority)
    return a.priority - b.priority;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

interface DaySlot {
  date: string;
  duration: number;
  songIds: number[];
  unavailable: boolean;
}

export function scheduleSongs(
  songs: ArrangeSong[],
  startDate: string,
  endDate: string,
  options: ScheduleOptions = {},
): ScheduleResult {
  const maxDailyDuration = options.maxDailyDuration ?? MAX_DAILY_SONG_DURATION;
  const unavailableDateSet = new Set(options.unavailableDates ?? []);
  const maxSongsPerDay = options.maxSongsPerDay ?? 0;
  const existingAssignments = options.existingAssignments ?? {};

  const rangeDates = getDateRange(startDate, endDate);
  if (rangeDates.length === 0) {
    return { assignments: {}, conflicts: [], dropped: songs.map(s => s.id), evicted: [] };
  }

  const allSongsMap = new Map<number, ArrangeSong>(
    [...songs, ...(options.existingSongs ?? [])].map(s => [s.id, s]),
  );

  const days: DaySlot[] = rangeDates.map((date) => {
    const existingIds = existingAssignments[date] ?? [];
    const existingDuration = existingIds.reduce(
      (sum, id) => sum + (allSongsMap.get(id)?.duration ?? 0),
      0,
    );
    return {
      date,
      duration: existingDuration,
      songIds: [...existingIds],
      unavailable: unavailableDateSet.has(date),
    };
  });

  const dayIndex = new Map<string, number>(days.map((d, i) => [d.date, i]));

  // 期望日期早于程序运行当天的视为“已过”（当天不算已过），已过歌曲不再定位到期望日期，改按欠播顺延补播
  const todayString = formatDate(new Date());

  const expectedSongs = songs
    .filter(s => s.expectedPlayDate && dayIndex.has(s.expectedPlayDate) && s.expectedPlayDate >= todayString)
    .sort(sortByPriorityAndCreatedAt);

  // 欠播（顺延）：期望日已被窗口越过（早于区间起点）或已过期，需在本次区间尽早补播；
  // 忽略 state 降级，按期望日先后、投稿时间排序，避免因 dropped 而持续落选
  const carriedSongs = songs
    .filter(s => s.expectedPlayDate && (s.expectedPlayDate < startDate || s.expectedPlayDate < todayString))
    .sort((a, b) => {
      const byExpected = a.expectedPlayDate!.localeCompare(b.expectedPlayDate!);
      return byExpected !== 0 ? byExpected : a.createdAt.getTime() - b.createdAt.getTime();
    });

  // 自由分配：无期望日期的歌曲；
  // 期望日期在未来且不在本次排歌区间内的歌曲不参与本次排歌（既不安排也不丢弃）
  const freeSongs = songs
    .filter(s => !s.expectedPlayDate)
    .sort(sortByPriorityAndCreatedAt);

  const assignments: Record<string, number[]> = {};
  for (const [date, ids] of Object.entries(existingAssignments)) {
    if (ids.length > 0)
      assignments[date] = [...ids];
  }

  const conflicts: ScheduleConflict[] = [];
  const dropped: number[] = [];
  const placedSongIds = new Set<number>();

  function canFitDay(day: DaySlot, duration: number): boolean {
    if (day.unavailable)
      return false;
    if (day.duration + duration > maxDailyDuration)
      return false;
    if (maxSongsPerDay > 0 && day.songIds.length + 1 > maxSongsPerDay)
      return false;
    return true;
  }

  function placeSong(day: DaySlot, song: ArrangeSong) {
    day.duration += song.duration;
    day.songIds.push(song.id);
    placedSongIds.add(song.id);
    if (!assignments[day.date])
      assignments[day.date] = [];
    assignments[day.date]!.push(song.id);
  }

  const evicted: number[] = [];
  // 仅“已有排期中无期望日期”的普通歌曲允许被抢占
  const evictableIds = new Set<number>(
    (options.existingSongs ?? [])
      .filter(s => !s.expectedPlayDate)
      .map(s => s.id),
  );

  // 计算在某天需抢占哪些普通歌曲才能容下 song；undefined 表示空间不足
  function planEviction(day: DaySlot, song: ArrangeSong): number[] | undefined {
    const needDuration = day.duration + song.duration - maxDailyDuration;
    const needCount = maxSongsPerDay > 0 ? day.songIds.length + 1 - maxSongsPerDay : 0;
    if (needDuration <= 0 && needCount <= 0)
      return [];

    // 优先抢占长歌曲，用最少的置换次数腾出空间
    const candidates = day.songIds
      .filter(id => evictableIds.has(id))
      .sort((a, b) => (allSongsMap.get(b)?.duration ?? 0) - (allSongsMap.get(a)?.duration ?? 0));

    const plan: number[] = [];
    let freed = 0;
    for (const id of candidates) {
      if (freed >= needDuration && plan.length >= needCount)
        break;
      plan.push(id);
      freed += allSongsMap.get(id)?.duration ?? 0;
    }
    if (freed < needDuration || plan.length < needCount)
      return undefined;
    return plan;
  }

  // 仅使用剩余容量放置（不抢占）
  function placePlain(day: DaySlot, song: ArrangeSong): boolean {
    if (!canFitDay(day, song.duration))
      return false;
    placeSong(day, song);
    return true;
  }

  // 尝试把 song 放到 day：先用剩余容量，不足时抢占普通歌曲腾位
  function placeWithEviction(day: DaySlot, song: ArrangeSong): boolean {
    if (day.unavailable)
      return false;
    if (canFitDay(day, song.duration)) {
      placeSong(day, song);
      return true;
    }

    const plan = planEviction(day, song);
    if (!plan || plan.length === 0)
      return false;

    for (const id of plan) {
      const idx = day.songIds.indexOf(id);
      if (idx < 0)
        continue;
      day.songIds.splice(idx, 1);
      day.duration -= allSongsMap.get(id)?.duration ?? 0;
      evicted.push(id);
      const dayAssignment = assignments[day.date];
      if (dayAssignment) {
        const assignIdx = dayAssignment.indexOf(id);
        if (assignIdx >= 0)
          dayAssignment.splice(assignIdx, 1);
      }
    }
    placeSong(day, song);
    return true;
  }

  // 从期望日向两侧就近寻找可放置的日期；allowEviction 为 false 时只用剩余容量
  function findNearestAvailableDay(
    targetDateStr: string,
    song: ArrangeSong,
    allowEviction: boolean,
  ): DaySlot | undefined {
    const targetIndex = dayIndex.get(targetDateStr);
    if (targetIndex === undefined)
      return undefined;

    const tryPlace = allowEviction
      ? (day: DaySlot) => placeWithEviction(day, song)
      : (day: DaySlot) => placePlain(day, song);

    for (let offset = 0; offset < days.length; offset++) {
      const leftIndex = targetIndex - offset;
      if (leftIndex >= 0 && tryPlace(days[leftIndex]!))
        return days[leftIndex]!;

      const rightIndex = targetIndex + offset;
      if (offset > 0 && rightIndex < days.length && tryPlace(days[rightIndex]!))
        return days[rightIndex]!;
    }

    return undefined;
  }

  // 第一步：处理有期望日期的歌曲，优先安排到对应日期
  for (const song of expectedSongs) {
    const expectedDateStr = song.expectedPlayDate!;
    const targetDay = days[dayIndex.get(expectedDateStr)!]!;

    if (targetDay.unavailable) {
      // 期望日不可用：先就近调整，全区间排满时才抢占普通歌曲
      const nearest = findNearestAvailableDay(expectedDateStr, song, false)
        ?? findNearestAvailableDay(expectedDateStr, song, true);
      if (!nearest) {
        conflicts.push({
          songId: song.id,
          expectedDate: expectedDateStr,
          reason: "unavailable",
        });
        dropped.push(song.id);
      }
      continue;
    }

    if (placePlain(targetDay, song))
      continue;

    // 期望日已满：先就近调整，全区间排满时才抢占普通歌曲
    const nearest = findNearestAvailableDay(expectedDateStr, song, false)
      ?? findNearestAvailableDay(expectedDateStr, song, true);
    if (nearest) {
      conflicts.push({
        songId: song.id,
        expectedDate: expectedDateStr,
        reason: "full",
        suggestedDate: nearest.date,
      });
    } else {
      conflicts.push({
        songId: song.id,
        expectedDate: expectedDateStr,
        reason: "full",
      });
      dropped.push(song.id);
    }
  }

  // 第二步：填补欠播（顺延）歌曲，从区间最早可用日开始优先补播
  for (const song of carriedSongs) {
    if (placedSongIds.has(song.id))
      continue;

    // 先用剩余容量；全区间排满时再抢占无期望日期的普通歌曲
    let placed = days.some(day => placePlain(day, song));
    if (!placed)
      placed = days.some(day => placeWithEviction(day, song));

    if (!placed)
      dropped.push(song.id);
  }

  // 第三步：用自由分配歌曲填充剩余容量
  for (const song of freeSongs) {
    if (placedSongIds.has(song.id))
      continue;

    let placed = false;
    for (const day of days) {
      if (canFitDay(day, song.duration)) {
        placeSong(day, song);
        placed = true;
        break;
      }
    }

    if (!placed)
      dropped.push(song.id);
  }

  // 重新排序：按排歌时的排歌优先级给每天重新分配播放顺序
  // 正好命中当天期望日的歌曲最前，其次期望日歌曲、顺延（欠播）歌曲，最后无期望日期的自由歌曲；同档内按状态优先级（missed>approved>dropped>failed）与投稿时间
  const bucketOf = (song: ArrangeSong): number => {
    if (!song.expectedPlayDate)
      return 2;
    if (song.expectedPlayDate >= startDate && song.expectedPlayDate >= todayString)
      return 0;
    return 1;
  };
  const compareForDay = (sa: ArrangeSong, sb: ArrangeSong): number => {
    const bucketA = bucketOf(sa);
    const bucketB = bucketOf(sb);
    if (bucketA !== bucketB)
      return bucketA - bucketB;
    // 顺延歌曲按期望日先后补播，与排歌时的处理保持一致
    if (bucketA === 1) {
      const byExpected = sa.expectedPlayDate!.localeCompare(sb.expectedPlayDate!);
      if (byExpected !== 0)
        return byExpected;
      return sa.createdAt.getTime() - sb.createdAt.getTime();
    }
    return sortByPriorityAndCreatedAt(sa, sb);
  };
  for (const date of Object.keys(assignments)) {
    assignments[date] = [...assignments[date]!].sort((a, b) => {
      const sa = allSongsMap.get(a);
      const sb = allSongsMap.get(b);
      if (!sa || !sb)
        return 0;
      // 正好命中当天期望日的歌曲置顶，优先于其余分档排序
      const exactA = sa.expectedPlayDate === date ? 0 : 1;
      const exactB = sb.expectedPlayDate === date ? 0 : 1;
      if (exactA !== exactB)
        return exactA - exactB;
      return compareForDay(sa, sb);
    });
  }

  return { assignments, conflicts, dropped, evicted };
}

export function getDayDuration(songIds: number[], songMap: Map<number, ArrangeSong>): number {
  return songIds.reduce((sum, id) => sum + (songMap.get(id)?.duration ?? 0), 0);
}
