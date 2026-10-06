/**
 * 排歌装配层（mutation 与 dry-run 脚本共用）
 *
 * 只读：把数据库中的数据装配成 ArrangePlanInput 并调用 planArrangement，
 * 返回结果与落库所需的所有原始行。任何调用方都不得复制第二份装配逻辑。
 *
 * 装配规则（IDEA.md）：
 *   · 可填充日 = 区间内、≥ 今天、该日还没有任何已播放（played）歌曲、且排期 status ≠ success。
 *     区间内早于今天的日期不接收新歌；其中未播放的歌曲进入候选池被排到未来，played 歌曲保持不动。
 *   · 候选池：state ∈ approved/missed/failed/dropped/used，且期望日为空或 ≤ end（未来期望不回拉），
 *     并且满足其一：
 *       ① 待排池状态（approved / dropped）—— 待排即未排期，始终参与（即使残留旧排期引用）；
 *       ② 未排期；
 *       ③ 就排在本次区间内（重新排序）；
 *       ④ 排期日已过、仍没播成（missed/failed）→ 拉回补播；
 *       ⑤ 期望日落在本次区间内 → 回期望日。
 *       ⑥ 已排期（used）只有「就排在本次区间内、且该日未锁定」才参与 —— 区间外或落在冻结日上的
 *          used 一律不纳入排歌，哪怕它的期望日落在本区间内也不拉回，保留原排期不动。
 *     —— 「已经排好的歌曲一般不会再动」（§5）：区间外已排期且不属于 ③④⑤⑥ 的歌曲一律保留原排期，
 *     既不会被搬到本次区间，也不会因此从原日期消失。
 *     —— 冻结日（status = success）整日不动（§5「排期状态为 success 时不需要再考虑该排期的歌曲」）：
 *     该日不会接收新歌，落在该日的 used 歌曲也不参与重排。
 *   · 状态语义：approved / dropped / missed / failed 是「待排池」状态（不应带排期），
 *     used 才是「已排期」。因此排入某天统一记为 used，未排上则退回待排池（见 arrangements.arrange）。
 *   · 固定占用（fixed）：排在可填充日、但不属于候选池的歌曲（如 e > end 的在场景歌曲），只占容量。
 */
import type { TSongState } from "~~/types";
import type { ArrangeFixedSong, ArrangePlanResult, ArrangeSong, ArrangeSongState } from "./types";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or } from "drizzle-orm";
import { MAX_DAILY_SONG_DURATION } from "~~/constants";
import { db } from "~~/server/db";
import { arrangements, songs } from "~~/server/db/schema";
import { getDateRange, localToday } from "./date";
import { planArrangement } from "./plan";

/** 参与排歌的歌曲状态（played 不参与排歌） */
export const CANDIDATE_STATES = ["approved", "missed", "failed", "dropped", "used"] as const;

/** 该状态的歌曲可以参与排歌、被移动 */
export function isMoveableState(state: string): state is ArrangeSongState {
  return (CANDIDATE_STATES as readonly string[]).includes(state);
}

/** 装配用到的歌曲原始行 */
export interface ArrangeSongRow {
  id: number;
  duration: number | null;
  expectedPlayDate: string | null;
  createdAt: Date;
  state: TSongState;
  arrangementDate: string | null;
  position: number | null;
}

export interface AssembleArrangeOptions {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  /** 每日最大歌曲数，0 / 省略表示不限制 */
  songCount?: number;
  maxDailyDuration?: number;
  /** 覆盖“今天”，默认 localToday() */
  today?: string;
}

export interface ArrangeAssembly {
  start: string;
  end: string;
  today: string;
  songCount: number;
  maxDailyDuration: number;
  /** 区间内全部日期，升序 */
  rangeDates: string[];
  /** 区间内可以排入新歌的日期，升序 */
  fillableDates: string[];
  /** 区间内 status === success 的日期（整日不动） */
  frozenDates: string[];
  /** 候选池原始行 */
  candidateRows: ArrangeSongRow[];
  /** 候选池（算法输入） */
  songs: ArrangeSong[];
  /** 每天不可移动的占用 */
  fixedByDay: Map<string, ArrangeFixedSong[]>;
  /** 区间内全部歌曲的原始行（含 played 与候选池外的歌曲），用于落库比对 */
  originalById: Map<number, ArrangeSongRow>;
  plan: ArrangePlanResult;
}

function toArrangeSong(row: ArrangeSongRow): ArrangeSong {
  return {
    id: row.id,
    duration: row.duration ?? 0,
    expectedPlayDate: row.expectedPlayDate,
    createdAt: row.createdAt,
    state: row.state as ArrangeSongState,
    currentDate: row.arrangementDate,
  };
}

/** 装配一次排歌输入并计算方案（只读，不写数据库） */
export async function assembleArrange(options: AssembleArrangeOptions): Promise<ArrangeAssembly> {
  const { start, end } = options;
  const songCount = options.songCount ?? 0;
  const maxDailyDuration = options.maxDailyDuration ?? MAX_DAILY_SONG_DURATION;
  const today = options.today ?? localToday();

  if (start > end)
    throw new Error(`参数错误：start(${start}) 晚于 end(${end})`);

  const rangeDates = getDateRange(start, end);

  // 1) 区间内每一天的排期状态与全部歌曲（含 played）
  const [arrangementRows, inRangeRows] = await Promise.all([
    db.query.arrangements.findMany({
      where: and(gte(arrangements.date, start), lte(arrangements.date, end)),
      columns: { date: true, status: true },
    }),
    db.query.songs.findMany({
      where: and(gte(songs.arrangementDate, start), lte(songs.arrangementDate, end)),
      columns: {
        id: true,
        duration: true,
        expectedPlayDate: true,
        createdAt: true,
        state: true,
        arrangementDate: true,
        position: true,
      },
      orderBy: asc(songs.id),
    }),
  ]);

  const statusOf = new Map(arrangementRows.map(row => [row.date, row.status]));
  const playedDates = new Set(
    inRangeRows.filter(row => row.state === "played").map(row => row.arrangementDate!),
  );
  /** 区间内已锁定的日期（status = success）：该日已排期的歌不再重新考虑（§5） */
  const frozenDates = rangeDates.filter(date => statusOf.get(date) === "success");
  const frozenDateSet = new Set(frozenDates);

  // 可填充日：≥ 今天、未播放过任何歌曲、排期未锁定
  const fillableDates = rangeDates.filter(date =>
    date >= today
    && !playedDates.has(date)
    && !frozenDateSet.has(date),
  );

  /** 「就排在本次区间内」且该日未锁定（冻结日的排期整日不动） */
  const inRangeReorderable = frozenDates.length === 0
    ? and(gte(songs.arrangementDate, start), lte(songs.arrangementDate, end))
    : and(
        gte(songs.arrangementDate, start),
        lte(songs.arrangementDate, end),
        notInArray(songs.arrangementDate, frozenDates),
      );

  // 2) 候选池：待排池状态 / 未排期 / 就排在本次区间内 / 排期日已过仍没播成（missed/failed）
  //    / 期望日落在本次区间内（回期望日）。其余「已经排好的歌曲」一律不动（IDEA.md §5）。
  const candidateRows = await db.query.songs.findMany({
    where: and(
      inArray(songs.state, [...CANDIDATE_STATES]),
      // 未来期望日不回拉：无期望日，或期望日在本次区间内/已过期
      or(isNull(songs.expectedPlayDate), lte(songs.expectedPlayDate, end)),
      or(
        // ① 待排池状态（approved / dropped）：待排 = 未排期，始终参与
        inArray(songs.state, ["approved", "dropped"]),
        // ②～⑤ 只对「待排池 / 欠播」状态生效；used 是已排期歌曲，不能凭期望日被拉回
        and(
          ne(songs.state, "used"),
          or(
            // ② 未排期
            isNull(songs.arrangementDate),
            // ③ 就排在本次区间内、且该日未锁定（重新排序）
            inRangeReorderable,
            // ④ 排期日已过、仍没播成（missed/failed）→ 拉回补播
            and(inArray(songs.state, ["missed", "failed"]), lt(songs.arrangementDate, today)),
            // ⑤ 期望日落在本次区间内 → 回期望日
            and(
              isNotNull(songs.expectedPlayDate),
              gte(songs.expectedPlayDate, start),
              lte(songs.expectedPlayDate, end),
            ),
          ),
        ),
        // ⑥ used（已排期）：只有「就排在本次区间内且该日未锁定」才参与重排；
        //    区间外（或落在冻结日上）的 used 一律不纳入排歌，保留原排期不动
        //    （既不搬家，也不会被落选解绑）
        and(
          eq(songs.state, "used"),
          inRangeReorderable,
        ),
      ),
    ),
    columns: {
      id: true,
      duration: true,
      expectedPlayDate: true,
      createdAt: true,
      state: true,
      arrangementDate: true,
      position: true,
    },
    orderBy: asc(songs.id),
  });

  // 3) 固定占用：排在可填充日、但不属于候选池的歌曲
  const candidateIds = new Set(candidateRows.map(row => row.id));
  const fixedByDay = new Map<string, ArrangeFixedSong[]>();
  for (const row of inRangeRows) {
    const date = row.arrangementDate!;
    if (!fillableDates.includes(date) || candidateIds.has(row.id))
      continue;
    const fixed = fixedByDay.get(date) ?? [];
    fixed.push({ id: row.id, duration: row.duration ?? 0 });
    fixedByDay.set(date, fixed);
  }

  const plan = planArrangement({
    start,
    end,
    today,
    days: fillableDates.map(date => ({ date, fixed: fixedByDay.get(date) ?? [] })),
    songs: candidateRows.map(toArrangeSong),
    maxDailyDuration,
    maxSongsPerDay: songCount > 0 ? songCount : undefined,
  });

  return {
    start,
    end,
    today,
    songCount,
    maxDailyDuration,
    rangeDates,
    fillableDates,
    frozenDates,
    candidateRows: candidateRows as ArrangeSongRow[],
    songs: candidateRows.map(toArrangeSong),
    fixedByDay,
    originalById: new Map<number, ArrangeSongRow>([
      ...(inRangeRows as ArrangeSongRow[]).map(row => [row.id, row] as const),
      ...(candidateRows as ArrangeSongRow[]).map(row => [row.id, row] as const),
    ]),
    plan,
  };
}
