/**
 * 排歌只读预演（dry-run）
 *
 * 不写入数据库，仅按 server/utils/arrange（IDEA.md）的规则计算区间排歌结果并打印前后对照。
 * 用于人工验收算法，避免直接落库造成不可逆改动。
 *
 * 装配与 `arrangements.arrange` mutation 同源（server/utils/arrange/assemble.ts）。
 *
 * 用法：
 *   pnpm tsx scripts/arrangeDryRun.ts                      # 默认今天起 5 天
 *   pnpm tsx scripts/arrangeDryRun.ts 2026-10-06 2026-10-10 12
 *   参数：<start> <end> [songCount]
 */
import type { ArrangeSongRow } from "~~/server/utils/arrange";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { addDays, assembleArrange, localToday } from "~~/server/utils/arrange";

const STATE_LABEL: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  used: "已排期",
  played: "已播放",
  dropped: "落选",
  missed: "错过",
  failed: "失败",
};

const start = process.argv[2] ?? localToday();
const end = process.argv[3] ?? addDays(start, 4);
const songCount = Number(process.argv[4] ?? 0);

const fmtDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function fmtFallback(id: number) {
  return `#${id}(不在候选池)`;
}

async function main() {
  if (start > end) {
    console.error(`参数错误：start(${start}) 晚于 end(${end})`);
    process.exit(1);
  }

  console.log(`排歌预演区间：${start} ~ ${end}（每日上限 ${MAX_DAILY_SONG_DURATION}s${songCount > 0 ? `，每日最多 ${songCount} 首` : "，不限曲数"}）`);

  const assembly = await assembleArrange({ start, end, songCount });
  const { plan, songs, originalById, fixedByDay, rangeDates, fillableDates, frozenDates } = assembly;
  const songMap = new Map(songs.map(song => [song.id, song]));

  const fmtRow = (row: ArrangeSongRow) =>
    `#${String(row.id).padStart(5)} ${STATE_LABEL[row.state] ?? row.state} E=${row.expectedPlayDate ?? "-"} ${fmtDuration(row.duration ?? 0)}`;

  const fmtId = (id: number) => {
    const row = originalById.get(id);
    return row ? `#${id}[${STATE_LABEL[row.state] ?? row.state}, ${fmtDuration(row.duration ?? 0)}, E=${row.expectedPlayDate ?? "-"}]` : fmtFallback(id);
  };

  console.log(`区间内日期：${rangeDates.length} 天，其中可填充 ${fillableDates.length} 天；冻结（status=success）：${frozenDates.join(", ") || "无"}`);
  console.log(`候选池：${songs.length} 首；固定占用日期：${[...fixedByDay.keys()].join(", ") || "无"}`);

  console.log("\n===== 排歌前（原始排期）=====");
  for (const date of rangeDates) {
    const rows = [...originalById.values()].filter(row => row.arrangementDate === date).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const total = rows.reduce((sum, row) => sum + (row.duration ?? 0), 0);
    const flags = [
      fillableDates.includes(date) ? "可填充" : "不可填充",
      frozenDates.includes(date) ? "冻结" : "",
    ].filter(Boolean).join("/");
    console.log(`${date} [${flags}]：${rows.length} 首 ${total}s`);
    for (const row of rows)
      console.log(`   ${fmtRow(row)}${row.state === "played" || !songMap.has(row.id) ? "（固定占用）" : ""}`);
  }

  console.log("\n===== 排歌后（计划）=====");
  for (const date of rangeDates) {
    const movableIds = plan.assignments[date] ?? [];
    const fixedIds = (fixedByDay.get(date) ?? []).map(fixed => fixed.id);
    if (movableIds.length === 0 && fixedIds.length === 0)
      continue;
    const total = plan.dayDurations[date] ?? 0;
    console.log(`${date}：排入 ${movableIds.length} 首 ${total}s（剩余 ${MAX_DAILY_SONG_DURATION - total}s）${fixedIds.length ? `，固定占用 ${fixedIds.length} 首` : ""}`);
    for (const id of movableIds)
      console.log(`   ${fmtId(id)}`);
    for (const id of fixedIds)
      console.log(`   ${fmtId(id)}（固定占用，位置不变）`);
  }

  console.log("\n===== 变化明细 =====");
  let changed = 0;
  for (const date of rangeDates) {
    const before = [...originalById.values()]
      .filter(row => row.arrangementDate === date && songMap.has(row.id))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(row => row.id);
    const after = plan.assignments[date] ?? [];
    if (before.join(",") === after.join(","))
      continue;
    changed += 1;
    const added = after.filter(id => !before.includes(id));
    const removed = before.filter(id => !after.includes(id));
    console.log(`${date}：`);
    if (added.length)
      console.log(`   + ${added.map(fmtId).join(", ")}`);
    if (removed.length)
      console.log(`   - ${removed.map(fmtId).join(", ")}`);
  }
  if (changed === 0)
    console.log("（无变化）");

  console.log("\n===== 汇总 =====");
  const placedDate = new Map<number, string>();
  for (const [date, ids] of Object.entries(plan.assignments)) {
    for (const id of ids)
      placedDate.set(id, date);
  }
  const newlyPlaced = [...placedDate.keys()].filter(id => !originalById.get(id)?.arrangementDate);
  console.log(`新排入：${newlyPlaced.length} 首 → ${newlyPlaced.map(fmtId).join(", ") || "无"}`);
  console.log(`调期（期望日 ≠ 实际日期）：${plan.adjustments.length} 首`);
  const REASON_LABEL = { past: "期望日已过顺延", full: "期望日已排满", frozen: "期望日不可填充", occupied: "期望日被固定占用占满" };
  for (const adjustment of plan.adjustments)
    console.log(`   #${adjustment.songId} 期望 ${adjustment.expectedDate} → 实际 ${adjustment.actualDate}（${REASON_LABEL[adjustment.reason]}）`);
  console.log(`原排期变化（被挤出/落选解绑）：${plan.evicted.length} 首`);
  for (const eviction of plan.evicted)
    console.log(`   #${eviction.songId} ${eviction.from ?? "未排期"} → ${eviction.to ?? "未排上"}`);
  console.log(`落选：${plan.dropped.length} 首`);
  if (plan.dropped.length)
    console.log(`   ${plan.dropped.map(fmtId).join(", ")}`);

  console.log("\n提示：本脚本为只读预演，未写入数据库。");
}

await main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
