import { Dexie, type EntityTable } from 'dexie';
import type { View } from '../sites/model';

export type ItemState = 'ghost' | 'later' | 'snoozed';

export interface GhostItem {
  /** `${host}:${id}` */
  key: string;
  /** feedgrab FeedItem.id (hash of the canonical permalink or text). */
  id: string;
  host: string;
  siteId: string;
  view: View;
  url?: string;
  title: string;
  excerpt: string;
  image?: string;
  author?: string;
  state: ItemState;
  snoozeUntil?: number;
  returnedAt?: number;
  auto?: { ruleId: string; criteria: string; confidence: number };
  summary?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

/** What a content script knows about an item when it ghostifies it. */
export type GhostDraft = Pick<GhostItem, 'id' | 'host' | 'siteId' | 'view' | 'title' | 'excerpt'> &
  Partial<Pick<GhostItem, 'url' | 'image' | 'author' | 'auto'>>;

export interface Embedding {
  key: string;
  model: string;
  dim: number;
  vector: number[];
}

/** API keys live here (extension origin only), never in storage.local, which content scripts can read. */
export interface Secret {
  id: 'openai' | 'openrouter' | 'gemini';
  value: string;
}

export const db = new Dexie('ghostify') as Dexie & {
  items: EntityTable<GhostItem, 'key'>;
  embeddings: EntityTable<Embedding, 'key'>;
  secrets: EntityTable<Secret, 'id'>;
  /** Items the user rescued from an auto-ghostify rule ("Not this"); rules skip them. */
  kept: EntityTable<{ key: string; at: number }, 'key'>;
};

db.version(1).stores({
  items: 'key, state, host, createdAt, snoozeUntil, *tags',
  embeddings: 'key',
});
db.version(2).stores({ secrets: 'id' });
db.version(3).stores({ kept: 'key' });
db.version(4).stores({ embeddings: 'key, model' });
