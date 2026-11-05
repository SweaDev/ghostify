import { matchSelector, type Selector } from 'feedgrab';

/** A link found in a sample item when the page was picked, offered as a choice later. */
export interface LinkOption {
  selector: Selector;
  url: string;
  text: string;
}

/** How to find an item's URL in one feed. An empty selector means automatic. */
export interface ItemLink {
  /** Relative to the item. */
  selector: Selector;
  options?: LinkOption[];
}

/** Item links by feed id. */
export type ItemLinks = Record<string, ItemLink>;

export const NO_SELECTOR: Selector = { type: 'css', value: '' };
const MAX_TEXT = 60;
const MAX_OPTIONS = 30;
const SAMPLE_ITEMS = 20;
const STABLE_ATTRS = ['data-testid', 'data-test', 'itemprop', 'rel'];
const STABLE_CLASS = /^[a-z][a-z-_]*[a-z]$/i;
const WORD_SEGMENT = /^[a-z][a-z_-]{1,30}$/i;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const quoted = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;

/** An absolute http(s) URL for `href`, or undefined. */
export function absoluteUrl(href: string | null | undefined, base: string): string | undefined {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return undefined;
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Number of non-empty path segments: `/user` is 1, `/user/status/1` is 3. */
export function pathDepth(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Index of the deepest URL (first one on ties), or -1 for none. */
export function deepestIndex(urls: string[]): number {
  let best = -1;
  let depth = -1;
  urls.forEach((u, i) => {
    const d = pathDepth(u);
    if (d > depth) [best, depth] = [i, d];
  });
  return best;
}

/** The first element `sel` matches inside `root`, or undefined (also for invalid selectors). */
export function matchIn(root: Element, sel: Selector): Element | undefined {
  if (!sel.value.trim()) return undefined;
  try {
    return matchSelector(root.ownerDocument, sel, { root }).elements[0];
  } catch {
    return undefined;
  }
}

/** The URL `sel` points to inside `root`: the matched element's href, or that of a link around or in it. */
export function urlIn(root: Element, sel: Selector, base: string): string | undefined {
  const el = matchIn(root, sel);
  const a = el && (el.closest('a[href]') ?? el.querySelector('a[href]'));
  return a && root.contains(a) ? absoluteUrl(a.getAttribute('href'), base) : undefined;
}

const linksIn = (root: Element) => [...root.querySelectorAll('a[href]')];
function firstMatch(root: Element, css: string): Element | null {
  try {
    return root.querySelector(css);
  } catch {
    return null;
  }
}

/** Ways to describe `a`, most general first; each is checked against the items later. */
function candidates(root: Element, a: Element): string[] {
  const out: string[] = [];
  for (const attr of STABLE_ATTRS) {
    const v = a.getAttribute(attr);
    if (v) out.push(`a[${attr}=${quoted(v)}]`);
  }
  const classes = [...a.classList]
    .filter((c) => STABLE_CLASS.test(c))
    .map((c) => `.${CSS.escape(c)}`);
  for (let n = 1; n <= classes.length; n++) out.push(`a${classes.slice(0, n).join('')}`);
  if (a.querySelector('time')) out.push('a:has(time)');
  const href = a.getAttribute('href') ?? '';
  const path = (() => {
    try {
      return new URL(href, 'https://x.invalid').pathname;
    } catch {
      return '';
    }
  })();
  for (const seg of path.split('/').filter((s) => WORD_SEGMENT.test(s)))
    out.push(`a[href*=${quoted(`/${seg}/`)}]`);
  const steps: string[] = [];
  for (let n: Element | null = a; n && n !== root; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    if (!parent) break;
    const nth = [...parent.children].filter((c) => c.localName === n?.localName).indexOf(n) + 1;
    steps.unshift(`${n.localName}:nth-of-type(${nth})`);
  }
  out.push(`:scope > ${steps.join(' > ')}`);
  return out;
}

/**
 * A CSS selector, relative to `root`, whose first match is `a`. Prefers the candidate that finds
 * a link in the most `samples` (other items of the same feed), so it carries over to them.
 */
export function relativeSelector(root: Element, a: Element, samples: Element[] = []): string {
  let best = '';
  let score = -1;
  for (const css of candidates(root, a)) {
    if (firstMatch(root, css) !== a) continue;
    const s = samples.filter((el) => el !== root && firstMatch(el, css)).length;
    if (s > score) [best, score] = [css, s];
  }
  return best;
}

/**
 * The distinct links (by URL) in `items[0]`, each with a selector that finds it there and,
 * ideally, its counterpart in the other items.
 */
export function linkOptions(items: Element[], base: string): LinkOption[] {
  const [root] = items;
  if (!root) return [];
  const samples = items.slice(0, SAMPLE_ITEMS);
  const seen = new Set<string>();
  const out: LinkOption[] = [];
  for (const a of linksIn(root)) {
    const url = absoluteUrl(a.getAttribute('href'), base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const value = relativeSelector(root, a, samples);
    if (!value) continue;
    const text = clean(a.textContent) || clean(a.getAttribute('aria-label'));
    out.push({ selector: { type: 'css', value }, url, text: text.slice(0, MAX_TEXT) });
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

/** Index of the option whose selector equals `sel`, or -1. */
export const optionIndex = (options: LinkOption[] | undefined, sel: Selector) =>
  options?.findIndex((o) => o.selector.type === sel.type && o.selector.value === sel.value) ?? -1;

/** A short label for an option: its path (or full URL if off-site) and link text. */
export function optionLabel(o: LinkOption, base: string): string {
  let where = o.url;
  try {
    const u = new URL(o.url);
    if (u.hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, ''))
      where = `${u.pathname}${u.search}`;
  } catch {}
  return o.text ? `${where} · ${o.text}` : where;
}
