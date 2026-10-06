/**
 * 落选审计（只读）
 *
 * 枚举区间内所有子区间，逐个跑装配层，检查有没有「明明还有合法空位、却仍然落选」的歌。
 * 合法空位 = 可填充日 d 满足：
 *   · `e 为空 或 e ≤ d`（不提前播，IDEA.md 决策 5）
 *   · 当天剩余时长 ≥ 歌曲时长
 *   · 当日曲数未达 `songCount` 上限（songCount = 0 表示不限）
 * 命中即视为 bug：按当前规则这首歌本该被排上。
 *
 * 注意：以下落选属于**预期行为**，本脚本不会报出来
 *   · 期望日当天及其后都排不下，只剩更早的空位（不提前播 → 宁可落选）
 *   · 期望日在区间之后（`e > end`，未来期望不回拉）
 *
 * 用法：
 *   npx tsx scripts/arrangeDroppedAudit.ts                          # 今天起 14 天，songCount=0
 *   npx tsx scripts/arrangeDroppedAudit.ts 2026-10-06 2026-10-23    # 指定窗口
 *   npx tsx scripts/arrangeDroppedAudit.ts 2026-10-06 2026-10-23 0,8,10,12   # 多个每日曲数上限
 */
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { addDays, assembleArrange, getDateRange, localToday } from "~~/server/utils/arrange";

/** 单个子区间的最大长度（天） */
const MAX_RANGE_DAYS = 6;

const start = process.argv[2] ?? localToday();
const end = process.argv[3] ?? addDays(start, 13);
const songCounts = (process.argv[4] ?? "0").split(",").map(Number).filter(n => Number.isInteger(n) && n >= 0);

if (start > end) {
  console.error(`参数错误：start(${start}) 晚于 end(${end})`);
  process.exit(1);
}

const dates = getDateRange(start, end);

console.log(`落选审计：${start} ~ ${end}（${dates.length} 天；每日曲数上限 ${songCounts.join(" / ")}）`);

let scanned = 0;
const findings: string[] = [];

for (const [i, rangeStart] of dates.entries()) {
  // 子区间右端：从 i 起最多 MAX_RANGE_DAYS 天
  for (const rangeEnd of dates.slice(i, i + MAX_RANGE_DAYS)) {
    for (const songCount of songCounts) {
      scanned += 1;

      let assembly;
      try {
        assembly = await assembleArrange({ start: rangeStart, end: rangeEnd, songCount });
      } catch (error) {
        findings.push(`区间 ${rangeStart}~${rangeEnd} songCount=${songCount}｜装配失败：${(error as Error).message}`);
        continue;
      }

      const { plan, songs, fillableDates, fixedByDay } = assembly;
      if (plan.dropped.length === 0)
        continue;

      const songMap = new Map(songs.map(song => [song.id, song]));
      const loads = new Map<string, { duration: number; count: number }>();
      for (const date of fillableDates) {
        loads.set(date, {
          duration: plan.dayDurations[date] ?? 0,
          count: (plan.assignments[date]?.length ?? 0) + (fixedByDay.get(date)?.length ?? 0),
        });
      }

      for (const id of plan.dropped) {
        const song = songMap.get(id)!;
        const legal = [...loads.entries()].filter(([date, load]) =>
          (song.expectedPlayDate === null || song.expectedPlayDate <= date)
          && MAX_DAILY_SONG_DURATION - load.duration >= song.duration
          && (songCount === 0 || load.count < songCount),
        );
        if (legal.length === 0)
          continue;
        findings.push(
          `区间 ${rangeStart}~${rangeEnd} songCount=${songCount}｜#${id} state=${song.state} E=${song.expectedPlayDate ?? "-"} 原排期=${song.currentDate ?? "-"} dur=${song.duration}s`
          + `｜本该能放：${legal.map(([date, load]) => `${date}(余 ${MAX_DAILY_SONG_DURATION - load.duration}s, ${load.count} 首)`).join(", ")}`,
        );
      }
    }
  }
}

console.log(`\n扫描 ${scanned} 组区间：`);
if (findings.length === 0) {
  console.log("  ✅ 没有「有空位却落选」的歌（剩余落选都属于「不提前播 / 不回拉」的预期行为）");
} else {
  for (const finding of findings)
    console.log(`  ❌ ${finding}`);
  console.log(`\n共 ${findings.length} 条，请检查 assemble.ts 的候选池与 plan.ts 的填充阶段。`);
}

process.exit(findings.length === 0 ? 0 : 1);
