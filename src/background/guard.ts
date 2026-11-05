import { browser } from 'wxt/browser';
import type { ProtocolMap } from '../messaging';
import type { GhostDraft } from '../store/db';
import { SAMPLE_MAX_CHARS } from '../store/samples';

export interface Sender {
  url?: string;
  tab?: unknown;
}

/** What content scripts (running on sites) may ask the background for. */
export const CONTENT_MESSAGES = new Set<keyof ProtocolMap>([
  'isGhosted',
  'ghostify',
  'autoGhostify',
  'unghost',
  'llm',
  'samplesNeeded',
  'saveSample',
]);

const MAX = { id: 200, title: 300, excerpt: 2000, author: 120, url: 2048, ids: 500 };

/** A content script: it runs in a tab and its URL is the page's, not an extension page. */
export function isContentScript(sender: Sender, extBase = browser.runtime.getURL('/')): boolean {
  return !!sender.tab && !sender.url?.startsWith(extBase);
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '');

/** Only absolute http(s) links. */
export function safeUrl(u: unknown): string | undefined {
  if (typeof u !== 'string' || u.length > MAX.url) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A draft with bounded strings and only http(s) links. */
export function cleanDraft(d: GhostDraft): GhostDraft {
  const auto = d.auto && {
    ruleId: clip(d.auto.ruleId, MAX.id),
    criteria: clip(d.auto.criteria, MAX.title),
    confidence: Math.max(0, Math.min(1, Number(d.auto.confidence) || 0)),
  };
  return {
    id: clip(d.id, MAX.id),
    host: clip(d.host, 253),
    siteId: clip(d.siteId, MAX.id),
    view: d.view === 'loggedIn' || d.view === 'loggedOut' ? d.view : 'any',
    title: clip(d.title, MAX.title) || 'Untitled',
    excerpt: clip(d.excerpt, MAX.excerpt),
    url: safeUrl(d.url),
    image: safeUrl(d.image),
    author: d.author ? clip(d.author, MAX.author) : undefined,
    ...(auto && { auto }),
  };
}

const deny = (why: string): never => {
  throw new Error(`Ghostify: ${why}`);
};

/**
 * Checks a message before its handler runs and returns the (cleaned) data. Extension pages may
 * send anything; content scripts only feed messages, and only about their own page's host.
 */
export function guard<K extends keyof ProtocolMap>(
  type: K,
  data: Parameters<ProtocolMap[K]>[0],
  sender: Sender,
  extBase?: string,
): Parameters<ProtocolMap[K]>[0] {
  const isDraft = type === 'ghostify' || type === 'autoGhostify';
  const clean = isDraft ? cleanDraft(data as GhostDraft) : data;
  if (!isContentScript(sender, extBase)) return clean as never;
  if (!CONTENT_MESSAGES.has(type)) deny(`${type} is not allowed from web pages`);
  let host = '';
  try {
    host = new URL(sender.url ?? '').hostname;
  } catch {
    deny('unknown sender');
  }
  if (isDraft && (clean as GhostDraft).host !== host) deny('host mismatch');
  if (type === 'isGhosted') {
    const d = data as { host: string; ids: string[] };
    if (d.host !== host) deny('host mismatch');
    return { host, ids: (Array.isArray(d.ids) ? d.ids : []).slice(0, MAX.ids) } as never;
  }
  if (type === 'unghost' && !(data as { key: string }).key?.startsWith(`${host}:`))
    deny('host mismatch');
  if (type === 'samplesNeeded' || type === 'saveSample') {
    const d = data as {
      siteId: unknown;
      feedId?: unknown;
      feedIds?: unknown;
      url: unknown;
      html?: unknown;
    };
    const url = safeUrl(d.url);
    if (!url || new URL(url).hostname !== host) deny('host mismatch');
    if (typeof d.siteId !== 'string' || d.siteId.length > MAX.id) deny('bad site');
    if (type === 'samplesNeeded') {
      const ids = (Array.isArray(d.feedIds) ? d.feedIds : []).filter((f) => typeof f === 'string');
      return { siteId: d.siteId, url, feedIds: ids.slice(0, 50) } as never;
    }
    if (typeof d.feedId !== 'string' || d.feedId.length > MAX.id) deny('bad feed');
    if (typeof d.html !== 'string' || d.html.length > SAMPLE_MAX_CHARS) deny('sample too large');
    return { siteId: d.siteId, feedId: d.feedId, url, html: d.html } as never;
  }
  return clean as never;
}
