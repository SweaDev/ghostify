import type { ContentKind, ImageInfo, MediaInfo } from 'feedgrab';
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

const MAX = {
  id: 200,
  title: 300,
  excerpt: 2000,
  author: 120,
  url: 2048,
  ids: 500,
  images: 8,
  html: 20_000,
  short: 60,
};
const KINDS = new Set<ContentKind>(['post', 'image', 'video', 'audio', 'pdf']);
const MEDIA_KINDS = new Set<MediaInfo['kind']>(['video', 'audio', 'pdf']);

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

const size = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v > 0 && v < 1e6 ? v : undefined;
};

function cleanImages(list: unknown): ImageInfo[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: ImageInfo[] = [];
  for (const i of list.slice(0, MAX.images) as Partial<ImageInfo>[]) {
    const src = safeUrl(i?.src);
    if (!src) continue;
    const img: ImageInfo = { src };
    const srcset = typeof i.srcset === 'string' ? clip(i.srcset, MAX.url * 2) : '';
    if (srcset) img.srcset = srcset;
    const alt = clip(i.alt, MAX.title);
    if (alt) img.alt = alt;
    const width = size(i.width);
    const height = size(i.height);
    if (width) img.width = width;
    if (height) img.height = height;
    out.push(img);
  }
  return out.length ? out : undefined;
}

function cleanMedia(m: unknown): MediaInfo | undefined {
  const v = m as Partial<MediaInfo> | undefined;
  if (!v || !MEDIA_KINDS.has(v.kind as MediaInfo['kind'])) return undefined;
  const out: MediaInfo = { kind: v.kind as MediaInfo['kind'] };
  for (const k of ['url', 'embedUrl', 'poster'] as const) {
    const u = safeUrl(v[k]);
    if (u) out[k] = u;
  }
  for (const k of ['mime', 'provider', 'providerId'] as const) {
    const s = clip(v[k], k === 'providerId' ? MAX.id : MAX.short);
    if (s) out[k] = s;
  }
  for (const k of ['duration', 'width', 'height'] as const) {
    const n = size(v[k]);
    if (n) out[k] = n;
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A draft with bounded strings and only http(s) links. */
export function cleanDraft(d: GhostDraft): GhostDraft {
  const auto = d.auto && {
    ruleId: clip(d.auto.ruleId, MAX.id),
    criteria: clip(d.auto.criteria, MAX.title),
    confidence: Math.max(0, Math.min(1, Number(d.auto.confidence) || 0)),
  };
  const images = cleanImages(d.images);
  const media = cleanMedia(d.media);
  return {
    id: clip(d.id, MAX.id),
    host: clip(d.host, 253),
    siteId: clip(d.siteId, MAX.id),
    view: d.view === 'loggedIn' || d.view === 'loggedOut' ? d.view : 'any',
    ...(d.feedId && { feedId: clip(d.feedId, MAX.id) }),
    title: clip(d.title, MAX.title) || 'Untitled',
    excerpt: clip(d.excerpt, MAX.excerpt),
    url: safeUrl(d.url),
    image: safeUrl(d.image),
    author: d.author ? clip(d.author, MAX.author) : undefined,
    ...(auto && { auto }),
    ...(d.kind && KINDS.has(d.kind) && { kind: d.kind }),
    ...(typeof d.publishedAt === 'string' &&
      ISO.test(d.publishedAt) && { publishedAt: d.publishedAt }),
    ...(images && { images }),
    ...(media && { media }),
    ...(typeof d.html === 'string' && d.html.length <= MAX.html && { html: d.html }),
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
