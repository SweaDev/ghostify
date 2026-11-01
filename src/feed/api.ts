import { sendMessage } from '../messaging';
import type { GhostDraft, GhostItem } from '../store/db';

/** What the feed runtime needs from the background (faked in tests). */
export interface RuntimeApi {
  isGhosted(host: string, ids: string[]): Promise<string[]>;
  ghostify(draft: GhostDraft): Promise<GhostItem>;
  unghost(key: string): Promise<void>;
  autoGhostify(draft: GhostDraft): Promise<GhostItem | null>;
}

export const messagingApi: RuntimeApi = {
  isGhosted: (host, ids) => sendMessage('isGhosted', { host, ids }),
  ghostify: (draft) => sendMessage('ghostify', draft),
  unghost: (key) => sendMessage('unghost', { key }),
  autoGhostify: (draft) => sendMessage('autoGhostify', draft),
};
