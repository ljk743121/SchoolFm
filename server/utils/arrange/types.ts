/**
 * 排歌算法类型定义
 *
 * 语义来源：IDEA.md
 * - 按天贪心：日期升序逐天处理，当天按优先级排序后贪婪填充，放不下的跳过继续（§3 规则 5）
 * - 两阶段：先让「期望日 = d」的歌曲在 d 落位，再用剩余容量补欠播/自由歌曲
 * - 不允许提前播：日期 d 只接受 e === null 或 e <= d 的歌曲
 * - played 不参与排歌，只能作为「固定占用」（ArrangeFixedSong）保留容量与位置
 */

/** 参与排歌的歌曲状态（played 被刻意排除） */
export type ArrangeSongState = "approved" | "missed" | "failed" | "dropped" | "used";

export interface ArrangeSong {
  id: number;
  /** 歌曲时长（秒），数据库允许为空，装配层需归一为 0 */
  duration: number;
  /** 期望播放日期 YYYY-MM-DD，null 表示自由分配 */
  expectedPlayDate: string | null;
  createdAt: Date;
  state: ArrangeSongState;
  /** 当前排期日（可能落在本次区间之外），null 表示尚未排期 */
  currentDate: string | null;
}

/** 当天不可移动的占用：已播放（played）或不属于本次候选池却在场的歌曲 */
export interface ArrangeFixedSong {
  id: number;
  duration: number;
}

/** 可填充的一天 */
export interface ArrangeDayInput {
  /** YYYY-MM-DD */
  date: string;
  /** 不可移动的占用，只占时长与曲数名额，不参与排序、不移动 */
  fixed?: ArrangeFixedSong[];
}

export interface ArrangePlanInput {
  start: string;
  end: string;
  /** 程序运行当天（YYYY-MM-DD），用于区分欠播与未来期望 */
  today: string;
  /** 可填充日，顺序不限（内部按日期升序处理） */
  days: ArrangeDayInput[];
  /** 候选池歌曲（含当前排在区间内的歌曲） */
  songs: ArrangeSong[];
  /** 每日最大播放时长（秒），默认 MAX_DAILY_SONG_DURATION */
  maxDailyDuration?: number;
  /** 每日最大歌曲数，0 / undefined 表示不限制 */
  maxSongsPerDay?: number;
}

/** 调期原因：期望日已过顺延补播 / 期望日已排满 / 期望日不可填充 / 期望日被固定占用占满 */
export type ArrangeAdjustmentReason = "past" | "full" | "frozen" | "occupied";

/** 期望日与实际排期日不一致的记录，用于前端提示 */
export interface ArrangeAdjustment {
  songId: number;
  expectedDate: string;
  actualDate: string;
  reason: ArrangeAdjustmentReason;
}

/** 被挪出原排期的歌曲（含被解绑而落选的歌曲） */
export interface ArrangeEviction {
  songId: number;
  /** 原排期日；null 表示原本未排期 */
  from: string | null;
  /** 最终去向；null 表示区间内没有排上 */
  to: string | null;
}

export interface ArrangePlanResult {
  /** 每天最终排入的歌曲（按播放顺序），不含当天固定占用 */
  assignments: Record<string, number[]>;
  /** 候选池中最终没有排上任何日期的歌曲 id */
  dropped: number[];
  /** 原排期发生变化的歌曲（落选的歌曲其 to 为 null） */
  evicted: ArrangeEviction[];
  /** 排到非期望日的歌曲 */
  adjustments: ArrangeAdjustment[];
  /** 每一天的总时长（含固定占用），便于调用方展示剩余容量 */
  dayDurations: Record<string, number>;
}
