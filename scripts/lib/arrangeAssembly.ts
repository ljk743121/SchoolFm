/**
 * 排歌装配层（脚本侧入口）
 *
 * 装配逻辑已上移到 `server/utils/arrange/assemble.ts`，与 `arrangements.arrange` mutation
 * 完全同源；这里只做转发，脚本仍可按原路径 import，禁止在脚本里复制第二份装配。
 * 规则见 IDEA.md。
 */
export { assembleArrange, CANDIDATE_STATES } from "~~/server/utils/arrange";
export type { ArrangeAssembly, ArrangeSongRow, AssembleArrangeOptions } from "~~/server/utils/arrange";
