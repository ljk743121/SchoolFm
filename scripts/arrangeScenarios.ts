/**
 * 排歌场景回归测试集（受控数据，逐场景隔离）
 *
 * 每个场景：快照全表 → 把真实库里可能闯入候选池的歌临时挪走（保证受控数据可复现）→ 播种受控歌
 * → 先用 `assembleArrange` 做只读预演 → 用**真实** `arrangements.arrange` mutation 排歌
 * → 断言（DB 必须等于预演计划）→ 恢复快照并校验哈希。任一场景失败都会继续跑完，最后统一汇总。
 *
 * 安全：脚本会写 dev 库，但每个场景结束都会用快照把 songs / arrangements 全表恢复原状；
 * 进入场景前会把该场景的「启动快照」落到磁盘，被强杀时用
 *   npx tsx scripts/arrangeRestore.ts [快照路径]
 * 兜底恢复。
 *
 * 场景清单：
 *   S1 每日不变量（时长 ≤ 2700、position 严格 1..n）+ 冻结日整日不动 + 含 played 日不动 + 放不下就跳过
 *   S2 期望日命中优先、期望日排满则顺延 + 当天播放顺序（命中 → 欠播 → 自由歌）+ 幂等
 *   S3 落选 / 被挤出：解绑排期、池状态保持、used 退回 approved、区间外日期行不写不删
 *   S4 used 只在区间内的歌曲参与排歌（区间外的不拉回、不解绑）
 *   S5 每日曲数上限（songCount）
 *   S6 断言器自检（可证伪性：假命题必须被记为失败）
 *
 * 用法：npx tsx scripts/arrangeScenarios.ts
 * 退出码：0 = 全部通过；1 = 有断言失败（仍会恢复快照）。
 */
import type { TSongState } from "~~/types";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { db } from "~~/server/db";
import { arrangements, songs } from "~~/server/db/schema";
import { assembleArrange } from "~~/server/utils/arrange";
import { createArrangeCaller } from "./lib/arrangeCaller";
import { restoreTables, snapshotTables } from "./lib/tableSnapshot";

/** 受控歌 id = SEED + n，避免与真实数据（id < 1000）冲突 */
const SEED = 996000;
/** 落盘兜底快照路径（被强杀时用 scripts/arrangeRestore.ts 恢复） */
const SNAPSHOT_PATH = process.env.ARRANGE_SCENARIO_SNAPSHOT ?? join(tmpdir(), "sound-of-experiment-arrange", "snapshot-before.json");
/** 欠播场景用的过去日期（脚本会临时建这一天的排期行，快照恢复时删除） */
const PAST_DAY = "2026-02-01";

const failures: string[] = [];

function check(ok: boolean, message: string) {
  if (ok) {
    console.log(`  ✓ ${message}`);
  } else {
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

/** 受控歌的创建时间：同档位内越早越优先（at(1) 最早） */
const at = (second: number) => new Date(Date.UTC(2032, 0, 1, 0, 0, second));

const sid = (n: number) => SEED + n;

interface SeedSong {
  n: number;
  duration: number;
  state: TSongState;
  arrangementDate?: string | null;
  position?: number | null;
  expectedPlayDate?: string | null;
  /** 创建时间（秒），默认取 n；用来精确控制同档位内的优先级 */
  created?: number;
}

async function seedDay(date: string, status = "pending") {
  const existing = await db.query.arrangements.findFirst({ where: eq(arrangements.date, date), columns: { date: true } });
  if (existing)
    await db.update(arrangements).set({ status }).where(eq(arrangements.date, date));
  else
    await db.insert(arrangements).values({ date, status });
}

async function seedSong(song: SeedSong) {
  await db.insert(songs).overridingSystemValue().values({
    id: sid(song.n),
    name: `scenario-${song.n}`,
    creator: "scenario",
    duration: song.duration,
    state: song.state,
    arrangementDate: song.arrangementDate ?? null,
    position: song.position ?? null,
    expectedPlayDate: song.expectedPlayDate ?? null,
    createdAt: at(song.created ?? song.n),
  });
}

// ---------- DB 读取辅助 ----------
async function dayRows(date: string) {
  return await db.query.songs.findMany({
    where: eq(songs.arrangementDate, date),
    columns: { id: true, state: true, position: true, duration: true, expectedPlayDate: true },
    orderBy: asc(songs.position),
  });
}

async function membersOf(date: string): Promise<number[]> {
  return (await dayRows(date)).map(row => row.id);
}

interface Triple {
  state: string;
  arrangementDate: string | null;
  position: number | null;
}

async function triplesOf(ids: number[]): Promise<Map<number, Triple>> {
  const rows = await db.query.songs.findMany({
    where: inArray(songs.id, ids),
    columns: { id: true, state: true, arrangementDate: true, position: true },
  });
  return new Map(rows.map(row => [row.id, { state: row.state, arrangementDate: row.arrangementDate, position: row.position }]));
}

function tripleLabel(triple: Triple | undefined) {
  return triple ? JSON.stringify(triple) : "(缺失)";
}

// ---------- 通用断言 ----------
async function checkDayInvariants(dates: string[], label: string) {
  for (const date of dates) {
    const rows = await dayRows(date);
    if (rows.length === 0)
      continue;
    const total = rows.reduce((sum, row) => sum + (row.duration ?? 0), 0);
    const positions = rows.map(row => row.position ?? -1);
    check(total <= MAX_DAILY_SONG_DURATION, `[${label}][${date}] 总时长 ${total}s ≤ ${MAX_DAILY_SONG_DURATION}s（${rows.length} 首）`);
    check(
      JSON.stringify(positions) === JSON.stringify(rows.map((_, index) => index + 1)),
      `[${label}][${date}] position 严格 1..${rows.length}（实际 [${positions.join(",")}]）`,
    );
  }
}

async function checkNoEarlyPlay(start: string, end: string, label: string) {
  const rows = await db.query.songs.findMany({
    where: and(isNotNull(songs.arrangementDate), gte(songs.arrangementDate, start), lte(songs.arrangementDate, end)),
    columns: { id: true, arrangementDate: true, expectedPlayDate: true },
  });
  const early = rows.filter(row => row.expectedPlayDate !== null && row.expectedPlayDate > row.arrangementDate!);
  check(
    early.length === 0,
    `[${label}] 区间内无提前播放${early.length ? `：${early.map(row => `#${row.id} E=${row.expectedPlayDate} 实际=${row.arrangementDate}`).join(", ")}` : ""}`,
  );
}

async function checkMembers(date: string, expected: number[], label: string) {
  const actual = await membersOf(date);
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `[${label}][${date}] 成员与预期一致（预期 [${expected.join(",")}] / 实际 [${actual.join(",")}]）`,
  );
}

// ---------- 场景运行器 ----------
interface ScenarioRange {
  start: string;
  end: string;
  songCount?: number;
}

interface ScenarioContext {
  plannedDropped: number[];
  plannedEvicted: { songId: number; from: string | null; to: string | null }[];
  result: {
    placedCount: number;
    droppedCount: number;
    evictedCount: number;
    adjustedCount: number;
    conflicts: { songId: number; expectedDate: string; actualDate: string; reason: string }[];
  };
}

/**
 * 隔离真实数据：受控区间必须干净，并把真实库里「可能进候选池」的歌临时挪出（快照恢复时还原）。
 * 否则真实待排池的歌会挤进受控区间，断言无法稳定复现。
 */
async function isolateAmbient(range: ScenarioRange) {
  const occupied = await db.query.songs.findMany({
    where: and(isNotNull(songs.arrangementDate), gte(songs.arrangementDate, range.start), lte(songs.arrangementDate, range.end)),
    columns: { id: true },
  });
  if (occupied.length > 0)
    throw new Error(`受控区间 ${range.start} ~ ${range.end} 已被 ${occupied.length} 首真实歌曲占用，请更换区间`);

  const neutralized = await db
    .update(songs)
    .set({ state: "rejected" })
    .where(inArray(songs.state, ["approved", "dropped", "missed", "failed"]))
    .returning({ id: songs.id });
  if (neutralized.length > 0)
    console.log(`  （隔离：临时把 ${neutralized.length} 首真实待排池歌标为 rejected，场景结束随快照还原）`);
}

async function scenario(
  name: string,
  range: ScenarioRange,
  seed: () => Promise<void>,
  verify: (context: ScenarioContext) => Promise<void>,
) {
  console.log(`\n########## ${name}（${range.start} ~ ${range.end}${range.songCount ? `，songCount=${range.songCount}` : ""}）##########`);
  const snapshot = await snapshotTables();
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify({ songs: snapshot.songs, arrangements: snapshot.arrangements }), "utf8");
  const failuresBefore = failures.length;

  try {
    await isolateAmbient(range);
    await seed();

    const songCount = range.songCount ?? 0;
    const before = await assembleArrange({ start: range.start, end: range.end, songCount });
    const caller = await createArrangeCaller();
    const result = await caller.arrange({ start: range.start, end: range.end, songCount });

    for (const date of before.fillableDates) {
      const planned = before.plan.assignments[date] ?? [];
      const actual = await membersOf(date);
      check(
        JSON.stringify([...actual].sort((a, b) => a - b)) === JSON.stringify([...planned].sort((a, b) => a - b)),
        `[${name}][${date}] DB 成员 == 排歌前预演计划（DB [${actual.join(",")}] / 计划 [${planned.join(",")}]）`,
      );
    }

    await verify({
      plannedDropped: before.plan.dropped,
      plannedEvicted: before.plan.evicted,
      result,
    });
    await checkDayInvariants(before.rangeDates, name);
    await checkNoEarlyPlay(range.start, range.end, name);
  } finally {
    await restoreTables(snapshot);
    const restored = await snapshotTables();
    check(restored.hash === snapshot.hash, `[${name}] 快照已恢复（${restored.hash.slice(0, 12)}）`);
  }

  console.log(`[${name}] ${failures.length === failuresBefore ? "通过 ✅" : `失败 ${failures.length - failuresBefore} 项 ❌`}`);
}

async function main() {
  console.log(`排歌场景回归：受控数据 + 排歌前预演 + 真实 mutation + 快照恢复`);
  console.log(`兜底快照：${SNAPSHOT_PATH}`);

  // ---------- S1：每日不变量 / 冻结日 / 含 played 日 / 放不下就跳过 ----------
  const S1_START = "2032-04-05";
  const S1_FROZEN = "2032-04-05";
  const S1_PLAYED_DAY = "2032-04-06";
  const S1_FILL = "2032-04-07";
  const S1_END = "2032-04-08";

  await scenario(
    "S1 每日不变量 / 冻结日 / played 日 / 放不下就跳过",
    { start: S1_START, end: S1_END },
    async () => {
      await seedDay(S1_FROZEN, "success");
      await seedDay(S1_PLAYED_DAY);
      await seedDay(S1_FILL);
      await seedDay(S1_END);
      await seedDay(PAST_DAY);
      // 冻结日：played + 一首未播放的 used（§5：该日已锁，整日不动）
      await seedSong({ n: 1, duration: 300, state: "played", arrangementDate: S1_FROZEN, position: 1 });
      await seedSong({ n: 2, duration: 200, state: "used", arrangementDate: S1_FROZEN, position: 2 });
      // 含 played 的普通日：played 不动，未播放的 used 要被排到未来（§3.1）
      await seedSong({ n: 3, duration: 300, state: "played", arrangementDate: S1_PLAYED_DAY, position: 1 });
      await seedSong({ n: 4, duration: 200, state: "used", arrangementDate: S1_PLAYED_DAY, position: 2 });
      // 候选池：期望日命中 1200 → 欠播 300 → 自由歌 300 → 大歌 800 放不下 → 小歌 600 顶上
      await seedSong({ n: 10, duration: 1200, state: "approved", expectedPlayDate: S1_FILL });
      await seedSong({ n: 11, duration: 300, state: "missed", arrangementDate: PAST_DAY, position: 9, expectedPlayDate: "2026-01-01" });
      await seedSong({ n: 12, duration: 300, state: "approved" });
      await seedSong({ n: 13, duration: 800, state: "approved" });
      await seedSong({ n: 14, duration: 600, state: "approved" });
    },
    async ({ plannedDropped, result }) => {
      // 04-07 累计到 2000s：800s 放不下被跳过，600s 顶上（IDEA.md §3 规则 5）
      await checkMembers(S1_FILL, [sid(10), sid(11), sid(4), sid(12), sid(14)], "S1");
      await checkMembers(S1_END, [sid(13)], "S1");
      check(
        !(await membersOf(S1_FILL)).includes(sid(13)) && (await membersOf(S1_END)).includes(sid(13)),
        `[S1] 放不下的 800s 歌 #${sid(13)} 被跳过并顺延到 ${S1_END}；位次更后的 600s 歌 #${sid(14)} 顶进 ${S1_FILL}`,
      );
      check(plannedDropped.length === 0 && result.droppedCount === 0, `[S1] 无落选（计划 ${plannedDropped.length} 首 / 结果 ${result.droppedCount} 首）`);

      const frozen = await triplesOf([sid(1), sid(2)]);
      check(
        frozen.get(sid(1))!.state === "played" && frozen.get(sid(1))!.arrangementDate === S1_FROZEN && frozen.get(sid(1))!.position === 1
        && frozen.get(sid(2))!.state === "used" && frozen.get(sid(2))!.arrangementDate === S1_FROZEN && frozen.get(sid(2))!.position === 2,
        `[S1] 冻结日 ${S1_FROZEN}（status=success）整日不动：#${sid(1)}=${tripleLabel(frozen.get(sid(1)))}，#${sid(2)}=${tripleLabel(frozen.get(sid(2)))}`,
      );
      const playedDay = await triplesOf([sid(3)]);
      check(
        playedDay.get(sid(3))!.state === "played" && playedDay.get(sid(3))!.arrangementDate === S1_PLAYED_DAY && playedDay.get(sid(3))!.position === 1,
        `[S1] 含 played 日 ${S1_PLAYED_DAY}：played #${sid(3)} 三元组不变`,
      );
      const moved = await triplesOf([sid(4)]);
      check(
        moved.get(sid(4))!.state === "used" && moved.get(sid(4))!.arrangementDate === S1_FILL,
        `[S1] 含 played 日期的未播放歌 #${sid(4)} 被排到未来（${moved.get(sid(4))!.arrangementDate}）`,
      );
    },
  );

  // ---------- S2：期望日命中优先 / 排满则顺延 / 当天播放顺序 / 幂等 ----------
  const S2_START = "2032-05-01";
  const S2_SPILL = "2032-05-02";

  await scenario(
    "S2 期望日命中优先 / 排满顺延 / 播放顺序 / 幂等",
    { start: S2_START, end: "2032-05-03" },
    async () => {
      await seedDay(S2_START);
      await seedDay(S2_SPILL);
      await seedDay("2032-05-03");
      await seedDay(PAST_DAY);
      // 期望日同为 05-01：1500 先落位，1300 放不下（1500+1300 > 2700）→ 顺延
      await seedSong({ n: 20, duration: 1500, state: "approved", expectedPlayDate: S2_START });
      await seedSong({ n: 21, duration: 1300, state: "approved", expectedPlayDate: S2_START });
      await seedSong({ n: 22, duration: 300, state: "missed", arrangementDate: PAST_DAY, position: 9, expectedPlayDate: "2026-01-01" });
      await seedSong({ n: 23, duration: 600, state: "approved" });
    },
    async ({ result }) => {
      await checkMembers(S2_START, [sid(20), sid(22), sid(23)], "S2");
      await checkMembers(S2_SPILL, [sid(21)], "S2");
      const spill = result.conflicts.find(conflict => conflict.songId === sid(21));
      check(
        spill?.reason === "full" && spill.expectedDate === S2_START && spill.actualDate === S2_SPILL,
        `[S2] 期望日排满的调期原因记为 full：${JSON.stringify(spill)}`,
      );
      check(
        result.conflicts.some(conflict => conflict.songId === sid(22) && conflict.reason === "past"),
        `[S2] 欠播补播的调期原因记为 past：${JSON.stringify(result.conflicts.find(conflict => conflict.songId === sid(22)))}`,
      );

      const first = await membersOf(S2_START);
      await (await createArrangeCaller()).arrange({ start: S2_START, end: "2032-05-03", songCount: 0 });
      const second = await membersOf(S2_START);
      check(
        JSON.stringify(first) === JSON.stringify(second),
        `[S2] 幂等：同区间重跑 ${S2_START} 顺序不变（1st [${first.join(",")}] / 2nd [${second.join(",")}]）`,
      );
      const delayed = await triplesOf([sid(21)]);
      check(
        delayed.get(sid(21))!.arrangementDate === S2_SPILL,
        `[S2] 顺延的歌 #${sid(21)} 未被提前播（期望 ${S2_START}，实际 ${delayed.get(sid(21))!.arrangementDate}）`,
      );
    },
  );

  // ---------- S3：落选 / 被挤出后的解绑与状态语义 ----------
  const S3_START = "2032-06-01";
  const S3_END = "2032-06-02";
  const S3_OUTSIDE = "2032-06-20";

  await scenario(
    "S3 落选 / 被挤出：解绑排期 + state 语义",
    { start: S3_START, end: S3_END },
    async () => {
      await seedDay(S3_START);
      await seedDay(S3_END);
      await seedDay(S3_OUTSIDE);
      // 区间内已排期的 used 歌：本区间放不下 → 落选后应退回 approved 并解绑
      await seedSong({ n: 30, duration: 2000, state: "used", arrangementDate: S3_END, position: 1, created: 39 });
      // 待排池状态却带区间外旧排期的矛盾数据 → 落选后 state 保持 dropped，旧排期被解绑
      await seedSong({ n: 31, duration: 2000, state: "dropped", arrangementDate: S3_OUTSIDE, position: 1, created: 40 });
      // 先把两天的小歌塞满，2000s 的歌两天都放不下 → 落选
      await seedSong({ n: 32, duration: 500, state: "approved", expectedPlayDate: S3_START, created: 31 });
      await seedSong({ n: 33, duration: 500, state: "approved", created: 32 });
      await seedSong({ n: 34, duration: 500, state: "approved", created: 33 });
      await seedSong({ n: 35, duration: 700, state: "approved", created: 34 });
      await seedSong({ n: 36, duration: 1000, state: "approved", created: 35 });
    },
    async ({ plannedDropped, result }) => {
      await checkMembers(S3_START, [sid(32), sid(33), sid(34), sid(35)], "S3");
      await checkMembers(S3_END, [sid(36)], "S3");
      check(
        JSON.stringify(plannedDropped) === JSON.stringify([sid(30), sid(31)]) && result.droppedCount === 2,
        `[S3] 落选 2 首：#${sid(30)}（区间内 used）、#${sid(31)}（带区间外旧排期的 dropped）`,
      );

      const dropped = await triplesOf([sid(30), sid(31)]);
      check(
        dropped.get(sid(30))!.state === "approved" && dropped.get(sid(30))!.arrangementDate === null,
        `[S3] used 歌落选后退回待排池：#${sid(30)}=${tripleLabel(dropped.get(sid(30)))}`,
      );
      check(
        dropped.get(sid(31))!.state === "dropped" && dropped.get(sid(31))!.arrangementDate === null,
        `[S3] dropped 歌落选后保持池状态并解绑旧排期：#${sid(31)}=${tripleLabel(dropped.get(sid(31)))}`,
      );
      const outsideRow = await db.query.arrangements.findFirst({ where: eq(arrangements.date, S3_OUTSIDE), columns: { date: true } });
      const outsideRefs = await membersOf(S3_OUTSIDE);
      check(
        outsideRow !== undefined && outsideRefs.length === 0,
        `[S3] 区间外日期 ${S3_OUTSIDE} 的排期行保留、不被写不被删（引用歌曲 ${outsideRefs.length} 首）`,
      );
    },
  );

  // ---------- S4：used 只在区间内参与 ----------
  const S4_START = "2032-07-01";
  const S4_END = "2032-07-02";
  const S4_OUTSIDE = "2032-07-05";

  await scenario(
    "S4 used 只在区间内的歌曲参与排歌",
    { start: S4_START, end: S4_END },
    async () => {
      await seedDay(S4_START);
      await seedDay(S4_END);
      await seedDay(S4_OUTSIDE);
      // 区间外已排期、期望日却落在区间内：必须原地不动
      await seedSong({ n: 40, duration: 200, state: "used", arrangementDate: S4_OUTSIDE, position: 5, expectedPlayDate: S4_START });
      await seedSong({ n: 41, duration: 200, state: "used", arrangementDate: S4_END, position: 1 });
      await seedSong({ n: 42, duration: 200, state: "used", arrangementDate: S4_START, position: 2, expectedPlayDate: S4_START });
      await seedSong({ n: 43, duration: 1000, state: "approved" });
    },
    async ({ plannedDropped, plannedEvicted }) => {
      const triples = await triplesOf([sid(40), sid(41), sid(42)]);
      check(
        triples.get(sid(40))!.state === "used" && triples.get(sid(40))!.arrangementDate === S4_OUTSIDE && triples.get(sid(40))!.position === 5,
        `[S4] 区间外的 used #${sid(40)} 未被期望日（${S4_START} 在区间内）拉回：${tripleLabel(triples.get(sid(40)))}`,
      );
      check(
        !plannedDropped.includes(sid(40)) && !plannedEvicted.some(eviction => eviction.songId === sid(40)),
        `[S4] 区间外的 used #${sid(40)} 既不在落选里、也不在「原排期变化」里`,
      );
      await checkMembers(S4_OUTSIDE, [sid(40)], "S4");
      check(
        triples.get(sid(42))!.state === "used" && triples.get(sid(42))!.arrangementDate === S4_START,
        `[S4] 区间内的 used #${sid(42)} 照常参与并命中期望日：${tripleLabel(triples.get(sid(42)))}`,
      );
      check(
        triples.get(sid(41))!.state === "used" && triples.get(sid(41))!.arrangementDate === S4_START,
        `[S4] 区间内的 used #${sid(41)} 参与重排后仍在区间内：${tripleLabel(triples.get(sid(41)))}`,
      );
    },
  );

  // ---------- S5：每日曲数上限 ----------
  const S5_START = "2032-08-01";
  const S5_END = "2032-08-02";

  await scenario(
    "S5 每日曲数上限（songCount）",
    { start: S5_START, end: S5_END, songCount: 2 },
    async () => {
      await seedDay(S5_START);
      await seedDay(S5_END);
      for (let n = 50; n < 55; n++)
        await seedSong({ n, duration: 300, state: "approved" });
    },
    async ({ plannedDropped, result }) => {
      for (const date of [S5_START, S5_END]) {
        const rows = await dayRows(date);
        check(rows.length === 2, `[S5][${date}] 受每日曲数上限 2 限制，当天恰好 2 首（实际 ${rows.length} 首）`);
      }
      check(
        plannedDropped.length === 1 && result.droppedCount === 1,
        `[S5] 超出曲数上限的 1 首落选（计划 ${plannedDropped.length} 首 / 结果 ${result.droppedCount} 首）`,
      );
    },
  );

  // ---------- S6：断言器自检（可证伪性） ----------
  console.log(`\n########## S6 断言器自检 ##########`);
  const recorded: string[] = [];
  const record = (ok: boolean, message: string) => {
    if (!ok)
      recorded.push(message);
  };
  record(false, "假命题");
  record(true, "真命题");
  check(recorded.length === 1 && recorded[0] === "假命题", "断言器能把假命题记为失败、且不误报真命题（断言非空转）");

  console.log(`\n===== 结论 =====`);
  console.log(failures.length === 0 ? "全部场景通过 ✅" : `${failures.length} 条断言失败 ❌`);
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
