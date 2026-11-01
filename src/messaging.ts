import { defineExtensionMessaging } from '@webext-core/messaging';
import type { CheckResult } from './ai/check';
import type { SearchResult } from './background/jobs';
import type { GhostDraft, GhostItem, ItemState } from './store/db';
import type { ListQuery } from './store/items';
import type { Purpose } from './store/settings';

export type LlmReply =
  | { ok: true; res: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface ProtocolMap {
  /** Ids (of `ids`) that are ghostified on `host` and must stay hidden. */
  isGhosted(data: { host: string; ids: string[] }): string[];
  ghostify(data: GhostDraft): GhostItem;
  unghost(data: { key: string }): void;
  setState(data: { key: string; state: ItemState; snoozeUntil?: number }): GhostItem;
  listItems(data: ListQuery): GhostItem[];
  openDashboard(): void;
  /** Injects the add/edit-site picker into a tab. */
  addSite(data: { tabId: number }): void;
  /** Tries the model configured for a purpose (AI settings "Test"). */
  checkAi(data: { purpose: Purpose }): CheckResult;
  /** Re-generates an item's summary and tags. */
  enrich(data: { key: string }): void;
  /** Ranks items by meaning; keyword fallback when AI is off or fails. */
  searchSemantic(data: { query: string; filters: ListQuery }): SearchResult;
  /** Embeds items that have no embedding for the current model; returns how many. */
  reindex(): number;
  /** feedgrab LLM proxy (createLlmProxy in content scripts); keys stay in the background. */
  llm(data: { req: unknown }): LlmReply;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
