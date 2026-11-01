import type { FeedItem } from 'feedgrab';
import type { View } from '../sites/model';
import type { GhostDraft } from '../store/db';

export interface ExtractContext {
  host: string;
  siteId: string;
  view: View;
  baseUrl: string;
}

const HEADING = 'h1, h2, h3, h4, [role="heading"]';
const AUTHOR = [
  '[rel="author"]',
  '[itemprop="author"]',
  'a[class*="author"]',
  '[class*="author"] a',
  '[class*="byline"]',
  '.crayons-story__secondary',
];
const NOT_CONTENT_IMG = /avatar|profile|icon|logo|emoji/i;
const MAX_EXCERPT = 400;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function absolute(href: string | null | undefined, base: string): string | undefined {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return undefined;
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function findUrl(el: Element, heading: Element | null, base: string): string | undefined {
  const fromHeading = heading?.closest('a[href]') ?? heading?.querySelector('a[href]');
  const candidates = [fromHeading, el.matches('a[href]') ? el : null, ...el.querySelectorAll('a')];
  for (const a of candidates) {
    const url = absolute(a?.getAttribute('href'), base);
    if (url) return url;
  }
  return undefined;
}

function findImage(el: Element, base: string): string | undefined {
  const preload = el.querySelector('[data-preload-image]')?.getAttribute('data-preload-image');
  if (preload) return absolute(preload, base);
  for (const img of el.querySelectorAll('img')) {
    const hint = `${img.className} ${img.alt}`;
    if (NOT_CONTENT_IMG.test(hint)) continue;
    const src = absolute(img.getAttribute('src'), base);
    if (src) return src;
  }
  return undefined;
}

function findAuthor(el: Element): string | undefined {
  for (const sel of AUTHOR) {
    for (const node of el.querySelectorAll(sel)) {
      const t = clean(node.textContent);
      if (t && t.length <= 80) return t;
    }
  }
  return undefined;
}

/** Turns a feedgrab item into what Ghostify stores. */
export function extractItem(
  item: Pick<FeedItem, 'id' | 'element' | 'text'>,
  ctx: ExtractContext,
): GhostDraft {
  const el = item.element;
  const heading = el.querySelector(HEADING);
  const text = clean(item.text());
  const title = clean(heading?.textContent) || text.slice(0, 120) || 'Untitled';
  let excerpt = text.startsWith(title) ? text.slice(title.length).trim() : text.replace(title, '');
  excerpt = clean(excerpt);
  if (excerpt.length > MAX_EXCERPT) excerpt = `${excerpt.slice(0, MAX_EXCERPT - 1)}…`;
  return {
    id: item.id,
    host: ctx.host,
    siteId: ctx.siteId,
    view: ctx.view,
    title,
    excerpt,
    url: findUrl(el, heading, ctx.baseUrl),
    image: findImage(el, ctx.baseUrl),
    author: findAuthor(el),
  };
}
