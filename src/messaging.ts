import { defineExtensionMessaging } from '@webext-core/messaging';
import type { CheckResult } from './ai/check';
import type { GhostDraft, GhostItem, ItemState } from './store/db';
import type { ListQuery } from './store/items';
import type { Purpose } from './store/settings';

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
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
