/**
 * 排歌端到端校验（真实库 + 受控数据）
 *
 * 流程：全表快照 → 插入受控数据 → 调真实 `arrangements.arrange` → 断言 → 再跑一次验幂等 → 恢复快照。
 * 断言口径来自 IDEA.md：
 *   · 每天总时长 ≤ MAX_DAILY_SONG_DURATION，position 严格 1..n 且不重复；
 *   · 只有「可填充日」（区间内、≥ 今天、当天无 played、status ≠ success）会被排入新歌；
 *   · played 歌曲的三元组（state / arrangementDate / position）完全不变；
 *   · status=success 的日期整日不动；
 *   · 不允许提前播：任何歌曲的实际日期 d 都满足 e === null 或 e ≤ d；
 *   · 落选/被挤出只解除排期引用，state 保持不变（missed 仍是 missed）；
 *   · 期望日正好在区间内的歌曲必须在期望日当天落位；
 *   · used（已排期）只在「就排在本次区间内」时参与排歌，区间外的 used 不得被期望日拉回；
 *   · 同一区间重复运行结果不变（幂等）。
 *
 * 用法：npx tsx scripts/arrangeVerify.ts
 * 退出码：0 = 全部通过并已恢复；1 = 有断言失败（仍会恢复快照）。
 */
import type { TSongState } from "~~/types";
import { eq } from "drizzle-orm";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { db } from "~~/server/db";
import { arrangements, songs } from "~~/server/db/schema";
import { assembleArrange } from "~~/server/utils/arrange";
import { createArrangeCaller } from "./lib/arrangeCaller";
import { restoreTables, snapshotTables } from "./lib/tableSnapshot";

/** 受控数据使用的远期区间，避免与真实排期冲突 */
const START = process.argv[2] ?? "2030-01-10";
const END = process.argv[3] ?? "2030-01-12";
const FROZEN_DAY = "2030-01-10"; // status = success，整日不动
const PLAYED_DAY = "2030-01-11"; // 含 played，不可填充
const FILL_DAY = "2030-01-12"; // 唯一可填充日

const SEED = 991000;
const FROZEN_P1 = SEED + 1;
const FROZEN_P2 = SEED + 2;
const PLAYED_ONLY = SEED + 3;
const MISSED_SONG = SEED + 4;
const FAILED_SONG = SEED + 5;
const EXPECTED_SONG = SEED + 6;
const LATE_SONG = SEED + 7;

/** 跨区间回归：区间 A 排完后再排区间 B，A 的成员不得被搬走 */
const RANGE_A_START = "2030-02-01";
const RANGE_A_END = "2030-02-02";
const RANGE_B_START = "2030-02-05";
const RANGE_B_END = "2030-02-06";
const ARRANGED_IN_A = SEED + 10;
const EXPECTED_IN_B = SEED + 11;
/** 落选但残留旧排期的歌曲（回归：待排池状态必须被重新纳入排歌） */
const DROPPED_STALE = SEED + 12;
const STALE_DAY = "2030-03-01";
/** used 的区间规则：区间外的 used 不得被期望日拉回（期望日故意落在区间内） */
const USED_OUT_OF_RANGE = SEED + 20;
const USED_OUT_DATE = "2030-01-20";
/** used 的区间规则：区间内的 used 照常参与排歌 */
const USED_IN_RANGE = SEED + 21;

const failures: string[] = [];
function check(ok: boolean, message: string) {
  if (ok) {
    console.log(`  ✓ ${message}`);
  } else {
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

const at = (second: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, second));

async function seedArrangement(date: string, status: string) {
  const existing = await db.query.arrangements.findFirst({ where: eq(arrangements.date, date), columns: { date: true } });
  if (existing)
    await db.update(arrangements).set({ status }).where(eq(arrangements.date, date));
  else
    await db.insert(arrangements).values({ date, status });
}

async function seedSong(song: {
  id: number;
  duration: number;
  state: TSongState;
  arrangementDate: string | null;
  position: number | null;
  expectedPlayDate?: string | null;
  createdAt: Date;
}) {
  await db.insert(songs).overridingSystemValue().values({
    id: song.id,
    name: `verify-${song.id}`,
    creator: "verify",
    duration: song.duration,
    state: song.state,
    arrangementDate: song.arrangementDate,
    position: song.position,
    expectedPlayDate: song.expectedPlayDate ?? null,
    createdAt: song.createdAt,
  });
}

interface Triple {
  state: string;
  arrangementDate: string | null;
  position: number | null;
}

async function triplesOf(ids: number[]): Promise<Map<number, Triple>> {
  const rows = await db.query.songs.findMany({
    where: (table, { inArray }) => inArray(table.id, ids),
    columns: { id: true, state: true, arrangementDate: true, position: true },
  });
  return new Map(rows.map(row => [row.id, { state: row.state, arrangementDate: row.arrangementDate, position: row.position }]));
}

/** 抓取每天落库后的有序成员（按 position 升序） */
async function membersByDate(rangeStart = START, rangeEnd = END): Promise<Map<string, number[]>> {
  const rows = await db.query.songs.findMany({
    where: (table, { isNotNull }) => isNotNull(table.arrangementDate),
    columns: { id: true, arrangementDate: true, position: true, createdAt: true },
  });
  const result = new Map<string, number[]>();
  const grouped = rows
    .filter(row => row.arrangementDate! >= rangeStart && row.arrangementDate! <= rangeEnd)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
  for (const row of grouped) {
    const list = result.get(row.arrangementDate!) ?? [];
    list.push(row.id);
    result.set(row.arrangementDate!, list);
  }
  return result;
}

async function main() {
  const snapshot = await snapshotTables();
  console.log(`区间：${START} ~ ${END}（冻结日 ${FROZEN_DAY} / played 日 ${PLAYED_DAY} / 可填充日 ${FILL_DAY}）`);
  console.log(`快照哈希：${snapshot.hash.slice(0, 12)}（run 前 ${snapshot.songs.length} 首歌曲，${snapshot.arrangements.length} 天排期）`);

  const caller = await createArrangeCaller();

  try {
    // ---------- 受控数据 ----------
    await seedArrangement(FROZEN_DAY, "success");
    await seedArrangement(PLAYED_DAY, "pending");
    await seedArrangement(FILL_DAY, "pending");
    await seedSong({ id: FROZEN_P1, duration: 300, state: "played", arrangementDate: FROZEN_DAY, position: 1, createdAt: at(1) });
    await seedSong({ id: FROZEN_P2, duration: 300, state: "played", arrangementDate: FROZEN_DAY, position: 2, createdAt: at(2) });
    await seedSong({ id: PLAYED_ONLY, duration: 300, state: "played", arrangementDate: PLAYED_DAY, position: 1, createdAt: at(3) });
    await seedSong({ id: MISSED_SONG, duration: 200, state: "missed", arrangementDate: FILL_DAY, position: 1, createdAt: at(4) });
    await seedSong({ id: FAILED_SONG, duration: 200, state: "failed", arrangementDate: FILL_DAY, position: 2, createdAt: at(5) });
    await seedSong({ id: EXPECTED_SONG, duration: 100, state: "approved", arrangementDate: null, position: null, expectedPlayDate: FILL_DAY, createdAt: at(6) });
    // 期望日 = FILL_DAY 的超长歌：FILL_DAY 放不下 → 绝不允许被提前安排到其它日期
    await seedSong({ id: LATE_SONG, duration: MAX_DAILY_SONG_DURATION - 10, state: "approved", arrangementDate: null, position: null, expectedPlayDate: FILL_DAY, createdAt: at(7) });
    // 跨区间回归用：期望日落在区间 A / 区间 B 的未排期歌
    await seedSong({ id: ARRANGED_IN_A, duration: 100, state: "approved", arrangementDate: null, position: null, expectedPlayDate: RANGE_A_START, createdAt: at(8) });
    await seedSong({ id: EXPECTED_IN_B, duration: 100, state: "approved", arrangementDate: null, position: null, expectedPlayDate: RANGE_B_START, createdAt: at(9) });
    // 落选（待排池状态）却残留旧排期引用的歌曲：必须被重新纳入排歌
    await seedArrangement(STALE_DAY, "pending");
    await seedSong({ id: DROPPED_STALE, duration: 100, state: "dropped", arrangementDate: STALE_DAY, position: 1, createdAt: at(10) });
    // used 区间规则：区间外已排期、期望日却落在本次区间内 → 不得被拉回，保留原排期
    await seedArrangement(USED_OUT_DATE, "pending");
    await seedSong({ id: USED_OUT_OF_RANGE, duration: 100, state: "used", arrangementDate: USED_OUT_DATE, position: 5, expectedPlayDate: FILL_DAY, createdAt: at(20) });
    // used 区间规则：就排在本次区间内 → 照常参与排歌
    await seedSong({ id: USED_IN_RANGE, duration: 100, state: "used", arrangementDate: FILL_DAY, position: 3, expectedPlayDate: FILL_DAY, createdAt: at(21) });

    const before = await triplesOf([FROZEN_P1, FROZEN_P2, PLAYED_ONLY]);
    const membersBefore = await membersByDate();

    // ---------- 第一次排歌 ----------
    const first = await caller.arrange({ start: START, end: END, songCount: 0 });
    console.log(`\n[run 1] 已安排 ${first.placedCount} 首，落选 ${first.droppedCount} 首，被挤出 ${first.evictedCount} 首，调期 ${first.adjustedCount} 首`);

    const assembly = await assembleArrange({ start: START, end: END });
    const { plan, fillableDates, rangeDates } = assembly;

    console.log("\n== 断言 1：只有可填充日被写入，且成员与计划一致 ==");
    const after1 = await membersByDate();
    for (const date of rangeDates) {
      const dbIds = after1.get(date) ?? [];
      if (!fillableDates.includes(date)) {
        check(
          JSON.stringify(dbIds) === JSON.stringify(membersBefore.get(date) ?? []),
          `[${date}] 不可填充日成员保持原样（${dbIds.length} 首）`,
        );
        continue;
      }
      const planned = plan.assignments[date] ?? [];
      check(
        JSON.stringify([...dbIds].sort((a, b) => a - b)) === JSON.stringify([...planned].sort((a, b) => a - b)),
        `[${date}] DB 成员与计划一致（DB ${dbIds.length} 首 / 计划 ${planned.length} 首）`,
      );
    }

    console.log("\n== 断言 2：每日容量与 position ==");
    const loadRows = await db.query.songs.findMany({
      where: (table, { isNotNull }) => isNotNull(table.arrangementDate),
      columns: { id: true, arrangementDate: true, position: true, duration: true },
    });
    for (const date of fillableDates) {
      const rows = loadRows.filter(row => row.arrangementDate === date).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const total = rows.reduce((sum, row) => sum + (row.duration ?? 0), 0);
      const positions = rows.map(row => row.position);
      check(total <= MAX_DAILY_SONG_DURATION, `[${date}] 总时长 ${total}s ≤ ${MAX_DAILY_SONG_DURATION}s`);
      check(
        JSON.stringify(positions) === JSON.stringify(rows.map((_, index) => index + 1)),
        `[${date}] position 严格 1..${rows.length}（实际 [${positions.join(",")}]）`,
      );
    }

    console.log("\n== 断言 3：played 与冻结日完全不动 ==");
    const afterTriples = await triplesOf([FROZEN_P1, FROZEN_P2, PLAYED_ONLY]);
    for (const [id, beforeTriple] of before) {
      const afterTriple = afterTriples.get(id)!;
      check(
        JSON.stringify(beforeTriple) === JSON.stringify(afterTriple),
        `#${id} 三元组不变：${JSON.stringify(afterTriple)}`,
      );
    }
    const frozenMembers = (after1.get(FROZEN_DAY) ?? []).sort((a, b) => a - b);
    check(JSON.stringify(frozenMembers) === JSON.stringify([FROZEN_P1, FROZEN_P2]), `冻结日 ${FROZEN_DAY} 成员保持 [#${FROZEN_P1}, #${FROZEN_P2}]`);
    const playedDayMembers = (after1.get(PLAYED_DAY) ?? []).sort((a, b) => a - b);
    check(JSON.stringify(playedDayMembers) === JSON.stringify([PLAYED_ONLY]), `含 played 的日期 ${PLAYED_DAY} 成员保持 [#${PLAYED_ONLY}]`);

    console.log("\n== 断言 4：不允许提前播（全库扫描区间内排期） ==");
    const earlyRows = (await db.query.songs.findMany({
      where: (table, { isNotNull }) => isNotNull(table.arrangementDate),
      columns: { id: true, arrangementDate: true, expectedPlayDate: true },
    })).filter(row => row.expectedPlayDate && row.arrangementDate! >= START && row.arrangementDate! <= END && row.expectedPlayDate > row.arrangementDate!);
    check(earlyRows.length === 0, `区间内无提前播放的歌曲${earlyRows.length ? `：${earlyRows.map(row => `#${row.id} E=${row.expectedPlayDate} 实际=${row.arrangementDate}`).join(", ")}` : ""}`);

    console.log("\n== 断言 5：受控歌曲的期望日 / 状态语义 ==");
    const after = await triplesOf([MISSED_SONG, FAILED_SONG, EXPECTED_SONG, LATE_SONG, DROPPED_STALE]);
    const expectedTriple = after.get(EXPECTED_SONG)!;
    check(expectedTriple.arrangementDate === FILL_DAY, `#${EXPECTED_SONG} 期望日命中，落在 ${FILL_DAY}（实际 ${expectedTriple.arrangementDate ?? "未排上"}）`);
    const lateTriple = after.get(LATE_SONG)!;
    check(lateTriple.arrangementDate === null || lateTriple.arrangementDate === FILL_DAY, `#${LATE_SONG} 不得被提前播（实际 ${lateTriple.arrangementDate ?? "未排上"}）`);
    // 状态语义：待排池状态（approved/dropped/missed/failed）排入后记为 used；未排上则退回待排池
    for (const [id, poolState] of [[MISSED_SONG, "missed"], [FAILED_SONG, "failed"], [DROPPED_STALE, "dropped"]] as const) {
      const triple = after.get(id)!;
      const placed = triple.arrangementDate !== null;
      check(
        placed ? triple.state === "used" : triple.state === poolState,
        `#${id} ${placed ? `已排入 ${triple.arrangementDate}，state 记为 used` : `未排上，state 保持 ${poolState} 并已解绑`}（实际 state=${triple.state}，date=${triple.arrangementDate ?? "null"}）`,
      );
      check(
        triple.arrangementDate === null || triple.arrangementDate === FILL_DAY,
        `#${id} 排期引用合法：${triple.arrangementDate ?? "已解绑"}`,
      );
    }
    // 回归：落选（待排池状态）却残留旧排期的歌曲必须重新参与排歌，不得继续占着旧日期
    const staleMembers = await membersByDate(STALE_DAY, STALE_DAY);
    check((staleMembers.get(STALE_DAY) ?? []).length === 0, `落选歌不再占着旧日期 ${STALE_DAY}（剩余 ${(staleMembers.get(STALE_DAY) ?? []).join(",") || "无"}）`);

    console.log("\n== 断言 8：used 只取区间范围内的歌曲 ==");
    const usedTriples = await triplesOf([USED_OUT_OF_RANGE, USED_IN_RANGE]);
    const outsideTriple = usedTriples.get(USED_OUT_OF_RANGE)!;
    check(
      outsideTriple.state === "used" && outsideTriple.arrangementDate === USED_OUT_DATE,
      `#${USED_OUT_OF_RANGE} 区间外的 used 未被期望日（${FILL_DAY} 在区间内）拉回：仍在 ${outsideTriple.arrangementDate}，state=${outsideTriple.state}`,
    );
    const outDateMembers = await membersByDate(USED_OUT_DATE, USED_OUT_DATE);
    check(
      JSON.stringify((outDateMembers.get(USED_OUT_DATE) ?? []).sort((a, b) => a - b)) === JSON.stringify([USED_OUT_OF_RANGE]),
      `[${USED_OUT_DATE}] 区间外日期的成员完全不变（原 #${USED_OUT_OF_RANGE}）`,
    );
    check(
      !plan.dropped.includes(USED_OUT_OF_RANGE) && !plan.evicted.some(eviction => eviction.songId === USED_OUT_OF_RANGE),
      `#${USED_OUT_OF_RANGE} 不参与本次排歌：既不在落选里，也不在「原排期变化」里`,
    );
    const insideTriple = usedTriples.get(USED_IN_RANGE)!;
    check(
      insideTriple.state === "used" && insideTriple.arrangementDate === FILL_DAY,
      `#${USED_IN_RANGE} 区间内的 used 照常参与（期望日命中）：${insideTriple.arrangementDate}，state=${insideTriple.state}`,
    );

    console.log("\n== 断言 6：同一区间重复运行结果不变（幂等） ==");
    const second = await caller.arrange({ start: START, end: END, songCount: 0 });
    const after2 = await membersByDate();
    for (const date of rangeDates) {
      check(
        JSON.stringify(after1.get(date) ?? []) === JSON.stringify(after2.get(date) ?? []),
        `[${date}] 第二次排歌结果与第一次一致（1st [${(after1.get(date) ?? []).join(",")}] / 2nd [${(after2.get(date) ?? []).join(",")}]）`,
      );
    }
    console.log(`  （第二次：已安排 ${second.placedCount} 首，落选 ${second.droppedCount} 首，被挤出 ${second.evictedCount} 首，调期 ${second.adjustedCount} 首）`);
    console.log(`  （计划视角：落选 ${plan.dropped.length} 首，调期 ${plan.adjustments.length} 首）`);

    console.log("\n== 断言 7：跨区间重排不得搬走已排好的歌曲（回归） ==");
    const runA = await caller.arrange({ start: RANGE_A_START, end: RANGE_A_END, songCount: 0 });
    const afterA = await membersByDate(RANGE_A_START, RANGE_A_END);
    const snapshotOfA = [...afterA.entries()].map(([date, ids]) => `${date}:${ids.join(",")}`).join("|");
    check((afterA.get(RANGE_A_START) ?? []).includes(ARRANGED_IN_A), `[${RANGE_A_START}] 期望日落在区间 A 的歌 #${ARRANGED_IN_A} 就位（已安排 ${runA.placedCount} 首）`);
    check(![...afterA.values()].flat().includes(EXPECTED_IN_B), `#${EXPECTED_IN_B} 期望日在区间 B，未被提前排入区间 A`);

    const runB = await caller.arrange({ start: RANGE_B_START, end: RANGE_B_END, songCount: 0 });
    const afterB = await membersByDate(RANGE_A_START, RANGE_A_END);
    check(
      [...afterB.entries()].map(([date, ids]) => `${date}:${ids.join(",")}`).join("|") === snapshotOfA,
      `排完区间 B 后，区间 A 的成员完全不变（原 ${snapshotOfA}）`,
    );
    const arrangedInANow = (await triplesOf([ARRANGED_IN_A])).get(ARRANGED_IN_A)!;
    check(arrangedInANow.arrangementDate === RANGE_A_START, `#${ARRANGED_IN_A} 未被搬到区间 B（实际 ${arrangedInANow.arrangementDate ?? "未排上"}）`);
    const bMembers = await membersByDate(RANGE_B_START, RANGE_B_END);
    check((bMembers.get(RANGE_B_START) ?? []).includes(EXPECTED_IN_B), `[${RANGE_B_START}] 期望日落在区间 B 的歌 #${EXPECTED_IN_B} 就位（已安排 ${runB.placedCount} 首）`);
  } finally {
    await restoreTables(snapshot);
    const restored = await snapshotTables();
    check(restored.hash === snapshot.hash, `快照已恢复（${restored.hash.slice(0, 12)}）`);
  }

  console.log(`\n结果：${failures.length === 0 ? "全部通过 ✅" : `${failures.length} 条失败 ❌`}`);
  for (const failure of failures)
    console.log(`  · ${failure}`);
  return failures.length === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
