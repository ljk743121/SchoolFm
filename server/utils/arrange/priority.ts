/**
 * 排歌优先级比较器
 *
 * state 权重（IDEA.md §3 规则 3）：missed(0) > approved(1) = used(1) > dropped(2) > failed(3)
 * createdAt 越早越优先（§3 规则 4）；完全相同时以 id 兜底，保证排序稳定、结果可复现。
 *
 * 三个比较器分别服务：
 *   compareHome      阶段 1：期望日正好是当天的歌曲之间比位次
 *   compareFill      阶段 2：用剩余容量填充时，有期望日的歌优先于自由歌曲（§3 规则 2）
 *   comparePlayOrder 某天最终成员的播放顺序（与优先级无关，只用稳定字段，保证重复排歌不漂移）
 */
import type { ArrangeSong, ArrangeSongState } from "./types";

const STATE_WEIGHT: Record<ArrangeSongState, number> = {
  missed: 0,
  approved: 1,
  used: 1,
  dropped: 2,
  failed: 3,
};

/** state 权重：数值越小越优先 */
export function stateWeight(state: ArrangeSongState): number {
  return STATE_WEIGHT[state];
}

/** 基础比较：state 权重 → createdAt 升序 → id 升序 */
function compareBase(a: ArrangeSong, b: ArrangeSong): number {
  const byState = stateWeight(a.state) - stateWeight(b.state);
  if (byState !== 0)
    return byState;

  const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreatedAt !== 0)
    return byCreatedAt;

  return a.id - b.id;
}

/** 阶段 1 排序：期望日正好等于当天的歌曲在期望日当天的位次 */
export function compareHome(a: ArrangeSong, b: ArrangeSong): number {
  return compareBase(a, b);
}

/**
 * 阶段 2 排序：有期望日的歌曲优先于自由分配歌曲；同为有期望日时，期望日越早越优先
 * （早欠先补），再按 state/createdAt 比较。
 */
export function compareFill(a: ArrangeSong, b: ArrangeSong): number {
  const expectedA = a.expectedPlayDate;
  const expectedB = b.expectedPlayDate;

  if (expectedA !== expectedB) {
    if (expectedA === null)
      return 1;
    if (expectedB === null)
      return -1;
    return expectedA < expectedB ? -1 : 1;
  }

  return compareBase(a, b);
}

/** 播放顺序档位：期望日正好是当天 → 欠播（期望日已过） → 自由分配 → 其它 */
function playTier(song: ArrangeSong, date: string): number {
  const expected = song.expectedPlayDate;
  if (expected === date)
    return 0;
  if (expected === null)
    return 2;
  return expected < date ? 1 : 3;
}

/**
 * 某天最终成员的播放顺序：先排出期望日正好是当天的，再按期望日升序排欠播，最后是自由歌曲。
 *  这里只用稳定字段（期望日 / createdAt / id），不含 state —— 排入会把 state 记为 used，
 *  若播放顺序依赖 state，重复排歌时同一天的顺序会漂移。
 */
export function comparePlayOrder(a: ArrangeSong, b: ArrangeSong, date: string): number {
  const tierA = playTier(a, date);
  const tierB = playTier(b, date);
  if (tierA !== tierB)
    return tierA - tierB;

  if (tierA === 1 && a.expectedPlayDate !== b.expectedPlayDate)
    return a.expectedPlayDate! < b.expectedPlayDate! ? -1 : 1;

  const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreatedAt !== 0)
    return byCreatedAt;

  return a.id - b.id;
}
