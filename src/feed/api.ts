import { sendMessage } from '../messaging';
import type { GhostDraft, GhostItem } from '../store/db';

/** What the feed runtime needs from the background (faked in tests). */
export interface RuntimeApi {
  isGhosted(host: string, ids: string[]): Promise<string[]>;
  ghostify(draft: GhostDraft): Promise<GhostItem>;
  unghost(key: string): Promise<void>;
  autoGhostify(draft: GhostDraft): Promise<GhostItem | null>;
  /** Feeds that need a fresh selector-check sample (optional: tests may omit it). */
  samplesNeeded?(siteId: string, feedIds: string[], url: string): Promise<string[]>;
  saveSample?(siteId: string, feedId: string, url: string, html: string): Promise<void>;
}

/** True for the error Chrome throws once the extension reloads under a still-open page. */
export function isContextInvalidated(e: unknown): boolean {
  return /extension context invalidated/i.test(e instanceof Error ? e.message : String(e));
}

export const messagingApi: RuntimeApi = {
  isGhosted: (host, ids) => sendMessage('isGhosted', { host, ids }),
  ghostify: (draft) => sendMessage('ghostify', draft),
  unghost: (key) => sendMessage('unghost', { key }),
  autoGhostify: (draft) => sendMessage('autoGhostify', draft),
  samplesNeeded: (siteId, feedIds, url) => sendMessage('samplesNeeded', { siteId, feedIds, url }),
  saveSample: (siteId, feedId, url, html) =>
    sendMessage('saveSample', { siteId, feedId, url, html }),
};
