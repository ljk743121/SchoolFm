import { describe, expect, it } from "vitest";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { type ArrangeSong, scheduleSongs } from "../arrange";

function song(
  id: number,
  duration: number,
  options: { expectedDate?: string; createdAt?: Date; priority?: number } = {},
): ArrangeSong {
  return {
    id,
    duration,
    expectedPlayDate: options.expectedDate ?? null,
    createdAt: options.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    priority: options.priority ?? 0,
  };
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// 以“程序运行当天”为锚点，保证“期望日已过”判断不受具体时间影响
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

/** 相对今天的日期，D(0)=今天 */
function D(n: number): string {
  return addDays(TODAY, n);
}

describe("scheduleSongs", () => {
  it("未填写期望日期的歌曲按投稿时间自由分配", () => {
    const songs = [
      song(1, 180, { createdAt: new Date("2026-01-01T00:00:00Z") }),
      song(2, 180, { createdAt: new Date("2026-01-02T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(1), D(1));
    expect(result.assignments[D(1)]).toStrictEqual([1, 2]);
    expect(result.dropped.length).toBe(0);
    expect(result.conflicts.length).toBe(0);
  });

  it("期望日期在排歌区间内的歌曲优先安排到对应日期", () => {
    const songs = [
      song(1, 180, { createdAt: new Date("2026-01-01T00:00:00Z") }),
      song(2, 180, { expectedDate: D(2), createdAt: new Date("2026-01-02T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(2));
    expect(result.assignments[D(2)]).toStrictEqual([2]);
    expect(result.assignments[D(0)]?.includes(1)).toBeTruthy();
    expect(result.dropped.length).toBe(0);
  });

  it("期望日期早于开始日期时作为欠播顺延补播", () => {
    const songs = [
      song(1, 180, { expectedDate: D(-3), createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(0));
    expect(result.assignments[D(0)]).toStrictEqual([1]);
    expect(result.conflicts.length).toBe(0);
  });

  it("期望日早于区间起点时顺延到区间最早可用日", () => {
    const songs = [
      song(1, 180, { expectedDate: D(1), createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    // 排下一周窗口（D(5)~D(8)），不含仍在未来的期望日 D(1)，应被顺延补播而非落选
    const result = scheduleSongs(songs, D(5), D(8));
    expect(result.assignments[D(5)]).toStrictEqual([1]);
    expect(result.dropped.length).toBe(0);
  });

  it("欠播歌曲优先于无期望日期的自由歌曲，且跳过不可用日", () => {
    const songs = [
      song(1, 180, { createdAt: new Date("2026-01-02T00:00:00Z") }), // 自由分配，早投稿
      song(2, 180, { expectedDate: D(1), createdAt: new Date("2026-01-03T00:00:00Z") }), // 欠播，晚投稿
    ];
    const result = scheduleSongs(songs, D(5), D(6), { unavailableDates: [D(5)] });
    expect(result.assignments[D(6)]).toStrictEqual([2, 1]);
    expect(result.dropped.length).toBe(0);
  });

  it("欠播歌曲按期望日先后补播，忽略 dropped 降级", () => {
    const songs = [
      song(1, 180, { expectedDate: D(3), priority: 1, createdAt: new Date("2026-01-01T00:00:00Z") }), // approved，期望较晚
      song(2, 180, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-02T00:00:00Z") }), // dropped，期望较早
    ];
    const result = scheduleSongs(songs, D(5), D(5));
    expect(result.assignments[D(5)]).toStrictEqual([2, 1]);
    expect(result.dropped.length).toBe(0);
  });

  it("期望日期等于当天不算已过，仍安排在当天", () => {
    const songs = [
      song(1, 180, { expectedDate: D(0), createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(0));
    expect(result.assignments[D(0)]).toStrictEqual([1]);
    expect(result.dropped.length).toBe(0);
    expect(result.conflicts.length).toBe(0);
  });

  it("期望日期在未来且不在排歌区间内的歌曲不参与本次排歌", () => {
    const songs = [
      song(1, 180, { expectedDate: D(30), createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(5));
    // 既不安排也不丢弃，留给后续排期窗口
    expect(Object.values(result.assignments).flat()).not.toContain(1);
    expect(result.dropped).not.toContain(1);
    expect(result.conflicts.length).toBe(0);
  });

  it("每日播放总时长不超过 45 分钟", () => {
    const longSong = song(1, 30 * 60);
    const songs: ArrangeSong[] = [];
    for (let i = 0; i < 5; i++) {
      songs.push({ ...longSong, id: i + 1, createdAt: new Date(`2026-01-01T0${i}:00:00Z`) });
    }
    const result = scheduleSongs(songs, D(1), D(1));
    const daySongs = result.assignments[D(1)] ?? [];
    const total = daySongs.reduce((sum, id) => sum + songs[id - 1]!.duration, 0);
    expect(total).toBeLessThanOrEqual(MAX_DAILY_SONG_DURATION);
    expect(result.dropped.length).toBe(4);
  });

  it("期望日期排满时自动调整到最近的可用日期并返回建议", () => {
    const songs = [
      song(3, 180, { expectedDate: D(0), createdAt: new Date("2026-01-03T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(1), {
      existingAssignments: { [D(0)]: [99] },
      existingSongs: [
        {
          id: 99,
          duration: MAX_DAILY_SONG_DURATION,
          expectedPlayDate: null,
          createdAt: new Date(),
          priority: 0,
        },
      ],
    });
    const day0 = result.assignments[D(0)] ?? [];
    const day1 = result.assignments[D(1)] ?? [];
    expect(day0.includes(3)).toBeFalsy();
    expect(day1.includes(3)).toBeTruthy();
    const conflict = result.conflicts.find(c => c.songId === 3);
    expect(conflict).toBeDefined();
    expect(conflict!.suggestedDate).toBe(D(1));
  });

  it("不可用的期望日期会自动调整到最近的可用日期", () => {
    const songs = [
      song(1, 180, { expectedDate: D(0), createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(2), {
      unavailableDates: [D(0)],
    });
    expect(result.assignments[D(1)]).toStrictEqual([1]);
    expect(result.dropped.length).toBe(0);
  });

  it("同时存在期望日期和自由分配歌曲时，期望日期优先占用容量", () => {
    const songs = [
      song(1, 20 * 60, { createdAt: new Date("2026-01-01T00:00:00Z") }),
      song(2, 20 * 60, { expectedDate: D(0), createdAt: new Date("2026-01-02T00:00:00Z") }),
      song(3, 20 * 60, { createdAt: new Date("2026-01-03T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(0), D(0));
    const day = result.assignments[D(0)] ?? [];
    expect(day.includes(2)).toBeTruthy();
    expect(day.length).toBe(2);
    expect(result.dropped.length).toBe(1);
  });

  it("遵守每日最大歌曲数量限制", () => {
    const songs = Array.from({ length: 5 }, (_, i) =>
      song(i + 1, 60, { createdAt: new Date(`2026-01-01T0${i}:00:00Z`) }));
    const result = scheduleSongs(songs, D(1), D(1), { maxSongsPerDay: 2 });
    const day = result.assignments[D(1)] ?? [];
    expect(day.length).toBe(2);
    expect(result.dropped.length).toBe(3);
  });

  it("会考虑已有的排歌记录计算剩余容量", () => {
    const songs = [song(1, 25 * 60), song(2, 15 * 60)];
    const result = scheduleSongs(songs, D(1), D(1), {
      existingAssignments: { [D(1)]: [99] },
      existingSongs: [
        { id: 99, duration: 25 * 60, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
      ],
    });
    const day = result.assignments[D(1)] ?? [];
    // 重排后按投稿时间排序：2 投稿更早，排在已有歌曲 99 之前
    expect(day).toStrictEqual([2, 99]);
    expect(result.dropped.length).toBe(1);
  });

  it("missed 歌曲优先级高于 approved 歌曲，优先占用容量", () => {
    const songs = [
      song(1, 25 * 60, { createdAt: new Date("2026-01-01T00:00:00Z"), priority: 1 }), // approved，早投稿
      song(2, 25 * 60, { createdAt: new Date("2026-01-02T00:00:00Z"), priority: 0 }), // missed，晚投稿
    ];
    const result = scheduleSongs(songs, D(0), D(0));
    const day = result.assignments[D(0)] ?? [];
    // 45 分钟容量仅够一首 25 分钟歌曲，missed（priority 0）优先被安排，approved 被丢弃
    expect(day).toStrictEqual([2]);
    expect(result.dropped).toStrictEqual([1]);
  });

  it("dropped 优先级高于 failed（对调后 dropped=2，failed=3）", () => {
    const songs = [
      song(1, 25 * 60, { createdAt: new Date("2026-01-01T00:00:00Z"), priority: 3 }), // failed，早投稿
      song(2, 25 * 60, { createdAt: new Date("2026-01-02T00:00:00Z"), priority: 2 }), // dropped，晚投稿
    ];
    const result = scheduleSongs(songs, D(0), D(0));
    const day = result.assignments[D(0)] ?? [];
    // 45 分钟容量仅够一首 25 分钟歌曲，dropped（priority 2）优先被安排，failed 被丢弃
    expect(day).toStrictEqual([2]);
    expect(result.dropped).toStrictEqual([1]);
  });

  it("未排满时欠播歌曲就近占空位，不抢占已有排期", () => {
    const songs = [
      song(1, 300, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(5), D(6), {
      existingAssignments: { [D(5)]: [99] },
      existingSongs: [
        { id: 99, duration: MAX_DAILY_SONG_DURATION, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
      ],
    });
    // D(5) 已满但 D(6) 有空位，应占空位而非抢占 99
    expect(result.assignments[D(5)]).toStrictEqual([99]);
    expect(result.assignments[D(6)]).toStrictEqual([1]);
    expect(result.evicted).toStrictEqual([]);
    expect(result.dropped.length).toBe(0);
  });

  it("整个区间排满时，欠播歌曲抢占无期望日期的普通歌曲", () => {
    const songs = [
      song(1, 300, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(5), D(5), {
      existingAssignments: { [D(5)]: [99] },
      existingSongs: [
        { id: 99, duration: 2600, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
      ],
    });
    // 全区间仅 D(5) 且已排满，欠播歌曲应挤占普通歌曲 99
    expect(result.assignments[D(5)]).toStrictEqual([1]);
    expect(result.evicted).toStrictEqual([99]);
    expect(result.dropped.length).toBe(0);
  });

  it("抢占时不会移除已有期望日期的歌曲", () => {
    const songs = [
      song(1, 300, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(5), D(5), {
      existingAssignments: { [D(5)]: [99, 98] },
      existingSongs: [
        { id: 99, duration: 2600, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
        { id: 98, duration: 90, expectedPlayDate: D(4), createdAt: new Date(), priority: 0 },
      ],
    });
    // 仅有 99 可被抢占，98 带期望日期应保留
    expect(result.evicted).toStrictEqual([99]);
    expect(result.assignments[D(5)]).toContain(98);
    expect(result.assignments[D(5)]).toContain(1);
  });

  it("抢占时优先挤出无期望日期的歌曲，带期望日期的歌曲不被挤出", () => {
    const songs = [
      song(3, 300, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(5), D(5), {
      existingAssignments: { [D(5)]: [1, 2] },
      existingSongs: [
        { id: 1, duration: 1400, expectedPlayDate: D(5), createdAt: new Date(), priority: 0 },
        { id: 2, duration: 1200, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
      ],
    });
    // 仅无期望日期的 2 被挤出，带期望日期的 1 保留
    expect(result.evicted).toStrictEqual([2]);
    expect(result.assignments[D(5)]).toContain(1);
    expect(result.assignments[D(5)]).toContain(3);
  });

  it("顺延的欠播歌曲排在无期望日期的自由歌曲之前", () => {
    const songs = [
      song(5, 300, { expectedDate: D(1), priority: 2, createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const result = scheduleSongs(songs, D(5), D(5), {
      existingAssignments: { [D(5)]: [10] },
      existingSongs: [
        { id: 10, duration: 2000, expectedPlayDate: null, createdAt: new Date(), priority: 0 },
      ],
    });
    expect(result.assignments[D(5)]).toStrictEqual([5, 10]);
  });

  it("正好命中当天期望日的歌曲排在被顺延歌曲之前", () => {
    // D(5)/D(6) 已满被顺延到 D(7)，与期望 D(7) 的歌曲同属档位 0
    const result = scheduleSongs([], D(3), D(7), {
      existingAssignments: { [D(7)]: [1, 2, 3, 4] },
      existingSongs: [
        { id: 1, duration: 180, expectedPlayDate: D(5), createdAt: new Date("2026-01-01T00:00:00Z"), priority: 1 },
        { id: 2, duration: 180, expectedPlayDate: D(6), createdAt: new Date("2026-01-02T00:00:00Z"), priority: 1 },
        { id: 3, duration: 180, expectedPlayDate: D(7), createdAt: new Date("2026-01-03T00:00:00Z"), priority: 1 },
        { id: 4, duration: 180, expectedPlayDate: D(7), createdAt: new Date("2026-01-04T00:00:00Z"), priority: 1 },
      ],
    });
    expect(result.assignments[D(7)]).toStrictEqual([3, 4, 1, 2]);
  });
});
