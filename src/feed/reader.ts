/** Reader view: used by extension pages (dashboard), never by content scripts. */

import type { PageDescription } from 'feedgrab';
import { extractArticle } from 'feedgrab/article';
import { describePage } from 'feedgrab/page';
import { browser } from 'wxt/browser';
import { type ContentRow, db, type GhostItem } from '../store/db';
import { sanitizeHtml } from '../ui/sanitize';

export type Readable = Pick<ContentRow, 'title' | 'byline' | 'siteName' | 'html' | 'text'>;

/** An item page as Ghostify uses it: the article (sanitized) and what feedgrab says about the page. */
export interface ParsedPage {
  article?: Readable;
  page: PageDescription;
}

/** Parses a fetched item page with feedgrab: the main article (sanitized) and the page's facts. */
export function parsePage(html: string, url: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const page = describePage(doc, url);
  const a = extractArticle(doc);
  if (!a?.html) return { page };
  return {
    page,
    article: {
      title: a.title || page.title || doc.title,
      byline: a.byline,
      siteName: a.siteName ?? page.siteName,
      html: sanitizeHtml(a.html),
      text: a.text,
    },
  };
}

const PLAYABLE = new Set(['video', 'audio', 'pdf']);

/**
 * What the item's page adds to the item: its player or file when the item is media without one,
 * and the author, date and image when the item has none. The item's kind never changes.
 */
export function pageFacts(item: GhostItem, page: PageDescription): Partial<GhostItem> {
  const patch: Partial<GhostItem> = {};
  const kind = item.kind ?? 'post';
  const playable = item.media?.url || item.media?.embedUrl;
  if (PLAYABLE.has(kind) && !playable && page.media && page.media.kind === kind) {
    patch.media = { ...page.media, ...item.media, kind: page.media.kind };
    if (page.media.url) patch.media.url = page.media.url;
    if (page.media.embedUrl) patch.media.embedUrl = page.media.embedUrl;
  }
  if (!item.author && page.author) patch.author = page.author;
  if (!item.publishedAt && page.publishedAt) patch.publishedAt = page.publishedAt;
  const image = page.media?.poster ?? page.images[0]?.src;
  if (!item.image && image) patch.image = image;
  return patch;
}

/** Origin pattern for a host permission request (`https://dev.to/*`). */
export const originOf = (url: string) => `${new URL(url).origin}/*`;

/**
 * Asks for access to the item's site. Call first thing in a click handler: browsers only show the
 * prompt during a user gesture. Resolves true at once when access was granted before.
 */
export function requestAccess(url: string): Promise<boolean> {
  return browser.permissions.request({ origins: [originOf(url)] }).catch(() => false);
}

export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const PAGE_TIMEOUT = 20_000;

/** The body as text, failing once it passes `max` bytes (so a huge page never fills memory). */
async function readCapped(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) throw new Error('The page is too large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      throw new Error('The page is too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * Fetches an item's page, stores its article (keeping AI notes made before) and fills in what the
 * page tells about the item (see `pageFacts`).
 */
export async function grabContent(
  key: string,
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ContentRow | undefined> {
  if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('Only web pages can be loaded');
  // Cookies are sent so pages you are logged in to load; only origins you granted are reachable.
  const res = await fetcher(url, {
    credentials: 'include',
    signal: AbortSignal.timeout(PAGE_TIMEOUT),
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? 'The site took too long to answer' : e.message);
  });
  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type && !/^text\/|xhtml/i.test(type))
    throw new Error(`Not a web page (${type.split(';')[0]})`);
  const { article, page } = parsePage(await readCapped(res, MAX_PAGE_BYTES), res.url || url);
  return db.transaction('rw', db.contents, db.items, async () => {
    const item = await db.items.get(key);
    const facts = item ? pageFacts(item, page) : {};
    if (item && Object.keys(facts).length)
      await db.items.update(key, { ...facts, updatedAt: Date.now() });
    if (!article) {
      if (Object.keys(facts).length) return db.contents.get(key);
      throw new Error('No readable content found on the page');
    }
    const old = await db.contents.get(key);
    const row: ContentRow = { ...old, ...article, key, url, fetchedAt: Date.now() };
    await db.contents.put(row);
    return row;
  });
}
