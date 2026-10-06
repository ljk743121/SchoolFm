/**
 * 崩溃恢复 CLI：用落盘快照把 dev 库的 songs / arrangements 恢复原状。
 *
 * arrangeScenarios / arrangeVerify 正常结束（含断言失败）都会自行恢复；只有脚本被强杀
 * （例如 Ctrl+C、`Select-Object -First` 提前终止管道）才需要本工具兜底。
 *
 * 用法：
 *   npx tsx scripts/arrangeRestore.ts <snapshot-before.json>
 *   默认快照路径：$env:TEMP/sound-of-experiment-arrange/snapshot-before.json
 *   （由 scripts/arrangeScenarios.ts 每进入一个场景前覆盖写入）
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSnapshotFile, restoreTables, snapshotTables } from "./lib/tableSnapshot";

const DEFAULT_SNAPSHOT = join(tmpdir(), "sound-of-experiment-arrange", "snapshot-before.json");
const snapshotPath = process.argv[2] ?? process.env.ARRANGE_SNAPSHOT ?? DEFAULT_SNAPSHOT;

async function main() {
  console.log(`[恢复] 快照文件：${snapshotPath}`);
  const target = await loadSnapshotFile(snapshotPath);
  console.log(`[恢复] 快照内容：songs=${target.songs.length} 行，arrangements=${target.arrangements.length} 行，hash=${target.hash}`);

  const current = await snapshotTables();
  console.log(`[恢复] 当前状态：songs=${current.songs.length} 行，arrangements=${current.arrangements.length} 行，hash=${current.hash}`);

  await restoreTables(target);

  const after = await snapshotTables();
  const ok = after.hash === target.hash;
  console.log(`[恢复] 恢复后：songs=${after.songs.length} 行，arrangements=${after.arrangements.length} 行，hash=${after.hash}`);
  console.log(`[恢复] 结果：${ok ? "一致，已回到快照状态" : "不一致！"}`);
  return ok ? 0 : 1;
}

await main()
  .then(code => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
