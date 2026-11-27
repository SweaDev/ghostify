import type { FeedItem } from 'feedgrab';
import type { View } from '../sites/model';
import type { GhostDraft } from '../store/db';

export interface ExtractContext {
  host: string;
  siteId: string;
  view: View;
  baseUrl: string;
}

const MAX_EXCERPT = 400;
const MAX_TITLE = 120;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function absolute(href: string | null | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns a feedgrab item into what Ghostify stores. feedgrab recognizes the item's kind and
 * attributes (`item.content()`); Ghostify only picks and shapes what it keeps.
 */
export function extractItem(
  item: Pick<FeedItem, 'id' | 'text' | 'permalink' | 'content'> & Partial<Pick<FeedItem, 'feedId'>>,
  ctx: ExtractContext,
): GhostDraft {
  const c = item.content();
  const text = clean(c.text);
  const title = clean(c.title) || clip(clean(item.text()), MAX_TITLE) || 'Untitled';
  const excerpt = clip(text, MAX_EXCERPT);
  const image = c.media?.poster ?? c.images[0]?.src;
  return {
    id: item.id,
    host: ctx.host,
    siteId: ctx.siteId,
    view: ctx.view,
    ...(item.feedId && { feedId: item.feedId }),
    title,
    excerpt,
    // feedgrab's permalink: the page's post-link selector, else its heuristic.
    url: absolute(item.permalink, ctx.baseUrl),
    image,
    author: c.author,
    kind: c.kind,
    ...(c.publishedAt && { publishedAt: c.publishedAt }),
    ...(c.images.length > 0 && { images: c.images }),
    ...(c.media && { media: c.media }),
    ...(c.html && { html: c.html }),
  };
}
