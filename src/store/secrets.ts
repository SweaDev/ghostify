import { db, type Secret } from './db';
import type { Keys } from './settings';

/** API keys; only callable from extension pages and the background (extension IndexedDB). */
export async function getKeys(): Promise<Keys> {
  const rows = await db.secrets.toArray();
  return Object.fromEntries(rows.map((r) => [r.id, r.value]));
}

export async function saveKey(id: Secret['id'], value: string): Promise<void> {
  if (value.trim()) await db.secrets.put({ id, value: value.trim() });
  else await db.secrets.delete(id);
}
