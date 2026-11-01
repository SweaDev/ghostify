/** Reader view: used by extension pages (dashboard), never by content scripts. */
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { browser } from 'wxt/browser';
import { type ContentRow, db } from '../store/db';

export type Readable = Pick<ContentRow, 'title' | 'byline' | 'siteName' | 'html' | 'text'>;

/** The main content of a page (Readability), sanitized, with links made absolute. */
export function parseReadable(html: string, url: string): Readable | undefined {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const article = new Readability(doc).parse();
  if (!article?.content) return undefined;
  const purify = DOMPurify(window);
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noreferrer');
    }
  });
  const clean = purify.sanitize(article.content, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
  });
  return {
    title: article.title?.trim() || doc.title,
    byline: article.byline?.trim() || undefined,
    siteName: article.siteName?.trim() || undefined,
    html: clean,
    text: (article.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim(),
  };
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

/** Fetches an item's page, extracts its content and stores it (keeping AI notes made before). */
export async function grabContent(
  key: string,
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ContentRow> {
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
  const readable = parseReadable(await readCapped(res, MAX_PAGE_BYTES), res.url || url);
  if (!readable) throw new Error('No readable content found on the page');
  return db.transaction('rw', db.contents, async () => {
    const old = await db.contents.get(key);
    const row: ContentRow = { ...old, ...readable, key, url, fetchedAt: Date.now() };
    await db.contents.put(row);
    return row;
  });
}
