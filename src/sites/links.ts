import {
  type FeedDescriptor,
  type FeedItem,
  matchSelector,
  openFeed,
  type PermalinkCandidate,
  type PermalinkParam,
  type Selector,
  suggestPermalinkParams,
} from 'feedgrab';

export const NO_SELECTOR: Selector = { type: 'css', value: '' };

/**
 * A feed's post link: its selector (empty = automatic) and the URL query parameters that identify
 * a post (unset = all but tracking ones, `[]` = none).
 */
export interface PostLink {
  selector: Selector;
  params?: string[];
}

/** A feed's post link. */
export const postLinkOf = (f: FeedDescriptor): PostLink => ({
  selector: f.permalink ?? NO_SELECTOR,
  ...(f.permalinkParams && { params: f.permalinkParams }),
});

/** The descriptor with `link` as its post link (empty selector and unset params removed). */
export function withPostLink(f: FeedDescriptor, link: PostLink): FeedDescriptor {
  const { permalink: _, permalinkParams: __, ...rest } = f;
  const { selector: sel, params } = link;
  const value = sel.value.trim();
  return {
    ...rest,
    ...(value && { permalink: { type: sel.type, value } }),
    ...(params && { permalinkParams: [...params].sort() }),
  };
}

/** Whether two descriptors have the same post link (selector and query parameters). */
export const samePostLink = (a: FeedDescriptor, b: FeedDescriptor) =>
  (a.permalink?.type ?? 'css') === (b.permalink?.type ?? 'css') &&
  (a.permalink?.value ?? '') === (b.permalink?.value ?? '') &&
  (a.permalinkParams?.join('&') ?? null) === (b.permalinkParams?.join('&') ?? null);

/** A query parameter offered for a post link, and whether it is kept. */
export interface ParamOption {
  name: string;
  /** Example value from the posts (unset when no post link has it). */
  value?: string;
  note: string;
  kept: boolean;
}

function paramNote(p?: PermalinkParam): string {
  if (!p) return 'not in these posts';
  const notes = [p.coverage < 1 && 'only in some posts'];
  if (p.uniqueness === 1) notes.push('different in each post');
  else if (p.uniqueness > 0) notes.push('repeats across posts');
  return notes.filter(Boolean).join(', ');
}

/** Query parameters found in the posts' links plus the saved ones, sorted by name. */
export function paramOptions(found: PermalinkParam[], params?: string[]): ParamOption[] {
  const names = [...new Set([...found.map((p) => p.name), ...(params ?? [])])].sort();
  return names.map((name) => {
    const p = found.find((f) => f.name === name);
    return {
      name,
      ...(p && { value: p.value }),
      note: paramNote(p),
      kept: params ? params.includes(name) : true,
    };
  });
}

/** The params after keeping or dropping `name`; unset again once every offered one is kept. */
export function toggleParam(
  options: ParamOption[],
  name: string,
  kept: boolean,
): string[] | undefined {
  const next = options.filter((o) => (o.name === name ? kept : o.kept)).map((o) => o.name);
  return next.length === options.length ? undefined : next;
}

/** Query parameters of the post links `d` finds in `items` (its selector, else automatic). */
export const linkParams = (items: FeedItem[], d: FeedDescriptor, baseUrl: string) =>
  suggestPermalinkParams(
    items.slice(0, 20).map((i) => i.element),
    baseUrl,
    d.permalink,
  );

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
    return sel && !f.permalink ? withPostLink(f, { ...postLinkOf(f), selector: sel }) : f;
  });
  return { ...rest, profile: { ...e.profile, feeds } } as unknown as E;
}
