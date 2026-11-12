import { storage } from 'wxt/utils/storage';
import { db } from './db';

/** `data`: Ghostified items only. `full`: every table but secrets, plus sites and settings. */
export type BackupKind = 'data' | 'full';

export interface Backup {
  format: 'ghostify-backup';
  kind: BackupKind;
  /** Ghostify version that made it. */
  app: string;
  /** Dexie schema version of the database it was read from. */
  dbVersion: number;
  createdAt: number;
  tables: Record<string, unknown[]>;
  /** Full backups: `local:` storage keys (null = unset). */
  storage?: Record<string, unknown>;
}

const DATA_TABLES = ['items', 'kept'];
/** API keys never leave the browser. */
const SKIPPED = new Set(['secrets']);
const STORAGE_KEYS = ['local:sites', 'local:settings'] as const;

const tableNames = (kind: BackupKind) =>
  kind === 'data' ? DATA_TABLES : db.tables.map((t) => t.name).filter((n) => !SKIPPED.has(n));

/** Reads a backup of the main database. */
export async function createBackup(kind: BackupKind, now = Date.now()): Promise<Backup> {
  const names = tableNames(kind);
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', names, async () => {
    for (const n of names) tables[n] = await db.table(n).toArray();
  });
  const backup: Backup = {
    format: 'ghostify-backup',
    kind,
    app: browser.runtime.getManifest().version,
    dbVersion: db.verno,
    createdAt: now,
    tables,
  };
  if (kind === 'full') {
    const values = await Promise.all(STORAGE_KEYS.map((k) => storage.getItem(k)));
    backup.storage = Object.fromEntries(STORAGE_KEYS.map((k, i) => [k, values[i] ?? null]));
  }
  return backup;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates a backup file's JSON; throws a readable error. */
export function parseBackup(raw: unknown): Backup {
  const b = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isObject(b) || b.format !== 'ghostify-backup') throw new Error('Not a Ghostify backup.');
  if (b.kind !== 'data' && b.kind !== 'full') throw new Error('Unknown backup kind.');
  if (!isObject(b.tables) || !Object.values(b.tables).every(Array.isArray))
    throw new Error('The backup has no tables.');
  for (const [name, rows] of Object.entries(b.tables)) {
    if (SKIPPED.has(name)) throw new Error(`Backups never hold ${name}.`);
    if (!(rows as unknown[]).every(isObject)) throw new Error(`Bad rows in ${name}.`);
  }
  if (b.storage !== undefined && !isObject(b.storage)) throw new Error('Bad storage in backup.');
  return {
    format: 'ghostify-backup',
    kind: b.kind,
    app: String(b.app ?? ''),
    dbVersion: Number(b.dbVersion) || 0,
    createdAt: Number(b.createdAt) || 0,
    tables: b.tables as Record<string, unknown[]>,
    ...(b.storage !== undefined && { storage: b.storage as Record<string, unknown> }),
  };
}

/** Rows whose primary key is a string (as every table here uses). */
function keyed(name: string, rows: unknown[]): Record<string, unknown>[] {
  const key = db.table(name).schema.primKey.keyPath as string;
  return (rows as Record<string, unknown>[]).filter((r) => typeof r[key] === 'string');
}

/**
 * Applies a backup to the main database. Data backups merge by key (a row replaces an existing
 * one only when its `updatedAt` is newer); full backups replace every table but secrets, and
 * the sites and settings. Tables this version doesn't know are skipped.
 */
export async function applyBackup(b: Backup): Promise<void> {
  if (b.kind === 'data') {
    const items = keyed('items', b.tables.items ?? []);
    const kept = keyed('kept', b.tables.kept ?? []);
    await db.transaction('rw', db.items, db.kept, async () => {
      const existing = await db.items.bulkGet(items.map((r) => r.key as string));
      const newer = items.filter(
        (r, i) => !existing[i] || Number(r.updatedAt ?? 0) > (existing[i]?.updatedAt ?? 0),
      );
      // biome-ignore lint/suspicious/noExplicitAny: rows come from a validated backup
      await db.items.bulkPut(newer as any);
      const have = await db.kept.bulkGet(kept.map((r) => r.key as string));
      // biome-ignore lint/suspicious/noExplicitAny: rows come from a validated backup
      await db.kept.bulkPut(kept.filter((_, i) => !have[i]) as any);
    });
    return;
  }
  const names = tableNames('full');
  await db.transaction('rw', names, async () => {
    for (const n of names) {
      await db.table(n).clear();
      const rows = b.tables[n];
      if (rows) await db.table(n).bulkAdd(keyed(n, rows));
    }
  });
  for (const k of STORAGE_KEYS) {
    if (!b.storage || !(k in b.storage)) continue;
    const v = b.storage[k];
    if (v == null) await storage.removeItem(k);
    else await storage.setItem(k, v);
  }
}
