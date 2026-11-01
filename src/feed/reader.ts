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

/** Fetches an item's page, extracts its content and stores it (keeping AI notes made before). */
export async function grabContent(
  key: string,
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ContentRow> {
  const res = await fetcher(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const readable = parseReadable(await res.text(), res.url || url);
  if (!readable) throw new Error('No readable content found on the page');
  return db.transaction('rw', db.contents, async () => {
    const old = await db.contents.get(key);
    const row: ContentRow = { ...old, ...readable, key, url, fetchedAt: Date.now() };
    await db.contents.put(row);
    return row;
  });
}
