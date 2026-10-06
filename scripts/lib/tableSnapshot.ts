import { createHash } from "node:crypto";
/**
 * songs / arrangements 全表快照与恢复（e2e 与恢复 CLI 共用）
 *
 * - `snapshotTables()` 读取两张表全量并计算哈希；
 * - `restoreTables()` 用单事务把两张表恢复为快照状态；
 * - `loadSnapshotFile()` 读取落盘 JSON 并还原 Date 字段（供崩溃后手动恢复）。
 */
import { readFile } from "node:fs/promises";
import { asc, eq } from "drizzle-orm";
import { db } from "~~/server/db";
import { arrangements, songs } from "~~/server/db/schema";

export type SongRow = typeof songs.$inferSelect;
export type ArrangementRow = typeof arrangements.$inferSelect;

export interface Snapshot {
  songs: SongRow[];
  arrangements: ArrangementRow[];
  hash: string;
}

export function hashSnapshot(snapshot: Pick<Snapshot, "songs" | "arrangements">): string {
  return createHash("sha256")
    .update(JSON.stringify({ songs: snapshot.songs, arrangements: snapshot.arrangements }))
    .digest("hex");
}

export async function snapshotTables(): Promise<Snapshot> {
  const songRows = await db.select().from(songs).orderBy(asc(songs.id));
  const arrangementRows = await db.select().from(arrangements).orderBy(asc(arrangements.date));
  return {
    songs: songRows,
    arrangements: arrangementRows,
    hash: hashSnapshot({ songs: songRows, arrangements: arrangementRows }),
  };
}

/** 用快照把 songs / arrangements 恢复原状（单事务） */
export async function restoreTables(snapshot: Snapshot): Promise<void> {
  await db.transaction(async (tx) => {
    const currentArrangements = await tx.select().from(arrangements);
    const currentDates = new Set(currentArrangements.map(row => row.date));
    const snapshotDates = new Set(snapshot.arrangements.map(row => row.date));

    // 1) 补回缺失的 arrangements 行
    for (const row of snapshot.arrangements) {
      if (!currentDates.has(row.date))
        await tx.insert(arrangements).values(row);
    }
    // 2) 修正被改动的 arrangements 行
    for (const row of snapshot.arrangements) {
      const current = currentArrangements.find(item => item.date === row.date);
      if (!current)
        continue;
      const sameCreatedAt = current.createdAt.getTime() === row.createdAt.getTime();
      if (current.status !== row.status || !sameCreatedAt)
        await tx.update(arrangements).set({ status: row.status, createdAt: row.createdAt }).where(eq(arrangements.date, row.date));
    }
    // 3) 删除多出来的 arrangements 行（外键 onDelete: set null 会先清空引用，随后由第 4 步修正）
    for (const current of currentArrangements) {
      if (!snapshotDates.has(current.date))
        await tx.delete(arrangements).where(eq(arrangements.date, current.date));
    }

    // 4) songs：逐行恢复（排歌不会新增/删除歌曲，这里仍做完整兜底）
    const currentSongs = await tx.select().from(songs);
    const currentSongIds = new Set(currentSongs.map(row => row.id));
    const snapshotSongIds = new Set(snapshot.songs.map(row => row.id));
    for (const row of snapshot.songs) {
      const { id, ...values } = row;
      if (!currentSongIds.has(id)) {
        await tx.insert(songs).overridingSystemValue().values(row);
        continue;
      }
      await tx.update(songs).set(values).where(eq(songs.id, id));
    }
    for (const current of currentSongs) {
      if (!snapshotSongIds.has(current.id))
        await tx.delete(songs).where(eq(songs.id, current.id));
    }
  });
}

/** 读取落盘快照 JSON，并把时间戳字段还原为 Date */
export async function loadSnapshotFile(path: string): Promise<Snapshot> {
  const raw = JSON.parse(await readFile(path, "utf8")) as {
    songs: (Omit<SongRow, "createdAt"> & { createdAt: string })[];
    arrangements: (Omit<ArrangementRow, "createdAt"> & { createdAt: string })[];
  };
  const revived = {
    songs: raw.songs.map(row => ({ ...row, createdAt: new Date(row.createdAt) })) as SongRow[],
    arrangements: raw.arrangements.map(row => ({ ...row, createdAt: new Date(row.createdAt) })) as ArrangementRow[],
  };
  return { ...revived, hash: hashSnapshot(revived) };
}
