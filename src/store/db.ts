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
  /** feedgrab feed the item came from (items from before 1.9.0 have none). */
  feedId?: string;
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
  Partial<Pick<GhostItem, 'feedId' | 'url' | 'image' | 'author' | 'auto'>>;

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

export interface DecisionRow {
  /** sha256 of [model, criteria, item text] */
  key: string;
  at: number;
  answer: { exclude: boolean; criteriaIndex?: number; confidence: number };
}

export type JobKind =
  | 'enrich'
  | 'embed'
  | 'search'
  | 'decision'
  | 'detect'
  | 'check'
  | 'digest'
  | 'ask';
export type JobStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';

/** One AI call, as shown in the AI activity log (see `src/background/ai-queue.ts`). */
export interface AiJob {
  id: string;
  kind: JobKind;
  /** What it is about, e.g. an item title. */
  label: string;
  itemKey?: string;
  /** `provider:model` */
  model?: string;
  status: JobStatus;
  /** False for jobs a caller is waiting on (decision, search, test): pausing them stops them. */
  pausable: boolean;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** System prompt and input (truncated). */
  system?: string;
  input?: string;
  output?: string;
  error?: string;
}

export interface QaEntry {
  id: string;
  q: string;
  a: string;
  at: number;
  jobId?: string;
  error?: string;
}

/** Full content grabbed from an item's page (reader view), plus AI notes on it. */
export interface ContentRow {
  key: string;
  url: string;
  title: string;
  byline?: string;
  siteName?: string;
  /** Sanitized article HTML. */
  html: string;
  text: string;
  fetchedAt: number;
  digest?: string;
  digestAt?: number;
  digestJob?: string;
  digestError?: string;
  qa?: QaEntry[];
}

/** A stripped-down copy of one feed (feedgrab `captureSample`), to check edited selectors. */
export interface SampleRow {
  /** `siteId|feedId` */
  key: string;
  siteId: string;
  feedId: string;
  /** Page the sample came from (base for its relative links). */
  url: string;
  html: string;
  capturedAt: number;
}

export const db = new Dexie('ghostify') as Dexie & {
  items: EntityTable<GhostItem, 'key'>;
  embeddings: EntityTable<Embedding, 'key'>;
  secrets: EntityTable<Secret, 'id'>;
  /** Items the user rescued from an auto-ghostify rule ("Not this"); rules skip them. */
  kept: EntityTable<{ key: string; at: number }, 'key'>;
  /** Cached decision-model answers (see `src/ai/decision-cache.ts`). */
  decisions: EntityTable<DecisionRow, 'key'>;
  aiJobs: EntityTable<AiJob, 'id'>;
  contents: EntityTable<ContentRow, 'key'>;
  samples: EntityTable<SampleRow, 'key'>;
};

db.version(1).stores({
  items: 'key, state, host, createdAt, snoozeUntil, *tags',
  embeddings: 'key',
});
db.version(2).stores({ secrets: 'id' });
db.version(3).stores({ kept: 'key' });
db.version(4).stores({ embeddings: 'key, model' });
db.version(5).stores({ decisions: 'key, at' });
db.version(6).stores({ aiJobs: 'id, createdAt, status', contents: 'key' });
db.version(7).stores({
  items: 'key, state, host, createdAt, snoozeUntil, *tags, [state+createdAt]',
});
db.version(8).stores({ samples: 'key, siteId' });
