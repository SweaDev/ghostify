import { storage } from 'wxt/utils/storage';
import { db } from './db';

/** What the background indexer is doing (session storage: extension pages only). */
export interface IndexStatus {
  running: boolean;
  /** When the current run started, and how many items were indexed then (for an ETA). */
  startedAt?: number;
  startIndexed?: number;
  /** Why the last run stopped early. */
  error?: string;
}

export const indexStatus = storage.defineItem<IndexStatus>('session:indexStatus', {
  fallback: { running: false },
});

/** Keys of items without an embedding from model `tag`, newest first. */
export async function missingKeys(tag: string): Promise<string[]> {
  const [all, have] = await Promise.all([
    db.items.orderBy('createdAt').reverse().primaryKeys(),
    db.embeddings.where('model').equals(tag).primaryKeys(),
  ]);
  const done = new Set(have);
  return all.filter((k) => !done.has(k));
}

export async function indexProgress(tag: string): Promise<{ total: number; indexed: number }> {
  const [total, missing] = await Promise.all([db.items.count(), missingKeys(tag)]);
  return { total, indexed: total - missing.length };
}
