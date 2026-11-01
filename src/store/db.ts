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

export const db = new Dexie('ghostify') as Dexie & {
  items: EntityTable<GhostItem, 'key'>;
  embeddings: EntityTable<Embedding, 'key'>;
};

db.version(1).stores({
  items: 'key, state, host, createdAt, snoozeUntil, *tags',
  embeddings: 'key',
});
