/**
 * 单日贪婪填充（IDEA.md §3 规则 5）
 *
 * 按当天优先级顺序依次尝试放入：能放进剩余额度就放入并累加，放不下则**跳过**继续尝试
 * 位次更靠后的歌曲（因此一首高优先级长歌不会挡住后面那首短歌）。
 */
import type { ArrangeSong } from "./types";

/** 每日容量上限 */
export interface ArrangeCapacity {
  maxDuration: number;
  /** 0 表示不限制曲数 */
  maxSongs: number;
}

/** 某一天的当前占用 */
export interface ArrangeDayLoad {
  duration: number;
  count: number;
  ids: number[];
}

export function emptyDayLoad(): ArrangeDayLoad {
  return { duration: 0, count: 0, ids: [] };
}

function fits(load: ArrangeDayLoad, capacity: ArrangeCapacity, song: ArrangeSong): boolean {
  if (load.duration + song.duration > capacity.maxDuration)
    return false;
  return capacity.maxSongs <= 0 || load.count + 1 <= capacity.maxSongs;
}

/**
 * 在当前占用基础上填充 candidates（必须已按当天优先级排好序），返回新的占用。
 * 纯函数：不修改传入的 load，也不修改 candidates。
 */
export function fillDay(
  load: ArrangeDayLoad,
  candidates: ArrangeSong[],
  capacity: ArrangeCapacity,
): ArrangeDayLoad {
  let duration = load.duration;
  let count = load.count;
  const ids = [...load.ids];

  for (const song of candidates) {
    if (!fits({ duration, count, ids }, capacity, song))
      continue;
    duration += song.duration;
    count += 1;
    ids.push(song.id);
  }

  return { duration, count, ids };
}
