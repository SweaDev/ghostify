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
  '[class*="author"]',
];
const DESCRIPTION = 'p, [class*="excerpt"], [class*="description"], [class*="summary"]';
/** Chrome around the content that should not end up in an excerpt. */
const NOISE =
  'h1, h2, h3, h4, [role="heading"], button, time, svg, img, [hidden], [aria-hidden="true"], [class*="dropdown"], [class*="preview"], [class*="author"], [class*="avatar"], [class*="reaction"], [class*="comment"], [class*="tag"], [class*="meta"], [class*="bottom"], [class*="footer"]';
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

/** Description-like paragraphs if there are any, else the item's text without its chrome. */
function findExcerpt(el: Element, title: string): string {
  const paras = [...el.querySelectorAll(DESCRIPTION)]
    .filter((p) => !p.closest(HEADING) && !p.parentElement?.closest(DESCRIPTION))
    .map((p) => clean(p.textContent))
    .filter((t) => t && t !== title);
  let text = [...new Set(paras)].join(' ');
  if (!text) {
    const copy = el.cloneNode(true) as Element;
    for (const n of copy.querySelectorAll(NOISE)) n.remove();
    text = clean(copy.textContent).replace(title, '').trim();
  }
  return text.length > MAX_EXCERPT ? `${text.slice(0, MAX_EXCERPT - 1)}…` : text;
}

/** Turns a feedgrab item into what Ghostify stores. */
export function extractItem(
  item: Pick<FeedItem, 'id' | 'element' | 'text' | 'permalink'>,
  ctx: ExtractContext,
): GhostDraft {
  const el = item.element;
  const heading = el.querySelector(HEADING);
  const title = clean(heading?.textContent) || clean(item.text()).slice(0, 120) || 'Untitled';
  const excerpt = findExcerpt(el, title);
  return {
    id: item.id,
    host: ctx.host,
    siteId: ctx.siteId,
    view: ctx.view,
    title,
    excerpt,
    // feedgrab's permalink: the page's post-link selector, else its heuristic.
    url: absolute(item.permalink, ctx.baseUrl),
    image: findImage(el, ctx.baseUrl),
    author: findAuthor(el),
  };
}
