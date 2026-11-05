import {
  type FeedDescriptor,
  type FeedItem,
  matchSelector,
  openFeed,
  type PermalinkCandidate,
  type Selector,
} from 'feedgrab';

export const NO_SELECTOR: Selector = { type: 'css', value: '' };

/** A feed's post-link selector, or the empty (automatic) one. */
export const permalinkOf = (f: FeedDescriptor): Selector => f.permalink ?? NO_SELECTOR;

/** The descriptor with `sel` as its post link (removed when empty). */
export function withPermalink(f: FeedDescriptor, sel: Selector): FeedDescriptor {
  const { permalink: _, ...rest } = f;
  const value = sel.value.trim();
  return value ? { ...rest, permalink: { type: sel.type, value } } : rest;
}

/** Index of the candidate whose selector equals `sel`, or -1. */
export const optionIndex = (options: PermalinkCandidate[], sel: Selector) =>
  options.findIndex((o) => o.selector.type === sel.type && o.selector.value === sel.value);

/** A short label for a candidate: its path (or full URL if off-site) and link text. */
export function optionLabel(o: PermalinkCandidate, base: string): string {
  let where = o.url;
  try {
    const u = new URL(o.url);
    const host = (h: string) => h.replace(/^www\./, '');
    if (host(u.hostname) === host(new URL(base).hostname)) where = `${u.pathname}${u.search}`;
  } catch {}
  return o.text ? `${where} · ${o.text}` : where;
}

/** What a feed descriptor finds in a document. */
export interface FeedCheck {
  items: FeedItem[];
  /** Items in which the post-link selector (if any) finds a link. */
  linkHits: number;
}

function selectorFindsLink(item: Element, sel: Selector): boolean {
  try {
    const el = matchSelector(item.ownerDocument, sel, { root: item }).elements[0];
    return !!el && !!(el.closest('a[href]') ?? el.querySelector('a[href]'));
  } catch {
    return false;
  }
}

/** Runs `d` on `doc` the way the feed runtime does (no live updates), e.g. on a saved sample. */
export function checkFeed(doc: Document, d: FeedDescriptor, baseUrl: string): FeedCheck {
  let items: FeedItem[] = [];
  try {
    const feed = openFeed(
      doc,
      { version: 1, hostname: new URL(baseUrl).hostname, pathPattern: '/', feeds: [d] },
      { live: false, builtinExclusions: false, baseUrl },
    );
    items = feed.items();
    feed.dispose();
  } catch {}
  const sel = d.permalink;
  const linkHits = sel ? items.filter((i) => selectorFindsLink(i.element, sel)).length : 0;
  return { items, linkHits };
}

type LegacyLinks = Record<string, { selector?: Selector } | undefined>;

/** Ghostify 1.4.6 kept post links beside the profile; they now live on feedgrab descriptors. */
export function migrateLinks<E extends { profile: { feeds: FeedDescriptor[] } }>(
  e: E & { links?: LegacyLinks },
): E {
  const { links, ...rest } = e;
  if (!links) return e;
  const feeds = e.profile.feeds.map((f) => {
    const sel = links[f.id]?.selector;
    return sel && !f.permalink ? withPermalink(f, sel) : f;
  });
  return { ...rest, profile: { ...e.profile, feeds } } as unknown as E;
}
