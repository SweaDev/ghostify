import { Dexie, type EntityTable } from 'dexie';
import { applyBackup, type Backup, createBackup } from './backup';

export type SnapshotReason = 'manual' | 'before-restore' | 'before-rekey';

/** What the Backups list shows; the backup itself is stored apart so listing stays cheap. */
export interface SnapshotMeta {
  id: string;
  reason: SnapshotReason;
  createdAt: number;
  app: string;
  /** Rows per table. */
  counts: Record<string, number>;
  /** JSON size in bytes. */
  size: number;
}

/** Automatic snapshots kept (manual ones stay until deleted). */
export const MAX_AUTO_SNAPSHOTS = 5;

/** Its own database, so snapshots survive a broken or newer-schema main database. */
const sdb = new Dexie('ghostify-snapshots') as Dexie & {
  snapshots: EntityTable<SnapshotMeta, 'id'>;
  blobs: EntityTable<{ id: string; backup: Backup }, 'id'>;
};
sdb.version(1).stores({ snapshots: 'id, createdAt', blobs: 'id' });

/** Stores a full backup of the main database as a snapshot. */
export async function takeSnapshot(
  reason: SnapshotReason,
  now = Date.now(),
): Promise<SnapshotMeta> {
  const backup = await createBackup('full', now);
  const meta: SnapshotMeta = {
    id: crypto.randomUUID(),
    reason,
    createdAt: now,
    app: backup.app,
    counts: Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length])),
    size: new Blob([JSON.stringify(backup)]).size,
  };
  await sdb.transaction('rw', sdb.snapshots, sdb.blobs, async () => {
    await sdb.snapshots.add(meta);
    await sdb.blobs.add({ id: meta.id, backup });
    const auto = await sdb.snapshots
      .orderBy('createdAt')
      .reverse()
      .filter((s) => s.reason !== 'manual')
      .primaryKeys();
    const old = auto.slice(MAX_AUTO_SNAPSHOTS);
    await sdb.snapshots.bulkDelete(old);
    await sdb.blobs.bulkDelete(old);
  });
  return meta;
}

/** Snapshots, newest first. */
export const listSnapshots = () => sdb.snapshots.orderBy('createdAt').reverse().toArray();

export async function getSnapshot(id: string): Promise<Backup> {
  const row = await sdb.blobs.get(id);
  if (!row) throw new Error('Snapshot not found.');
  return row.backup;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await sdb.transaction('rw', sdb.snapshots, sdb.blobs, async () => {
    await sdb.snapshots.delete(id);
    await sdb.blobs.delete(id);
  });
}

/** Restores a backup after taking a `before-restore` snapshot, so the restore can be undone. */
export async function restoreBackup(b: Backup, now = Date.now()): Promise<void> {
  await takeSnapshot('before-restore', now);
  await applyBackup(b);
}
