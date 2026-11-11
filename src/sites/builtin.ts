import type { Selector } from 'feedgrab';
import { DEFAULT_SITES } from './defaults';
import { samePostLink } from './links';
import { pageKey, type Site, type SiteProfileEntry } from './model';
import { sameStructure } from './structure';

/** The shipped version of a built-in site. */
export const shippedSite = (site: Site): Site | undefined =>
  site.builtin ? DEFAULT_SITES.find((d) => d.id === site.id) : undefined;

/**
 * The shipped page each of the site's pages comes from (undefined for pages the user added).
 * A page is linked by its `builtinKey`, or else by its own key when no other page claims it.
 */
export function shippedPages(site: Site): (SiteProfileEntry | undefined)[] {
  const d = shippedSite(site);
  if (!d) return site.profiles.map(() => undefined);
  const byKey = new Map(d.profiles.map((p) => [pageKey(p), p]));
  const claimed = new Set(site.profiles.map((e) => e.builtinKey));
  const used = new Set<string>();
  return site.profiles.map((e) => {
    const key = e.builtinKey ?? (claimed.has(pageKey(e)) ? undefined : pageKey(e));
    const s = key && !used.has(key) ? byKey.get(key) : undefined;
    if (key && s) used.add(key);
    return s;
  });
}

const sameSel = (a: Selector, b: Selector) => a.type === b.type && a.value === b.value;

/** Whether a page differs from its shipped version (view, path or feed selectors). */
export function isPageCustomized(e: SiteProfileEntry, shipped: SiteProfileEntry): boolean {
  const a = e.profile;
  const b = shipped.profile;
  return (
    e.view !== shipped.view ||
    a.pathPattern !== b.pathPattern ||
    a.feeds.length !== b.feeds.length ||
    a.feeds.some((f, i) => {
      const g = b.feeds[i];
      return (
        !g ||
        !sameSel(f.container, g.container) ||
        !sameSel(f.item, g.item) ||
        !samePostLink(f, g) ||
        !sameStructure(f.structure, g.structure)
      );
    })
  );
}

const copy = (e: SiteProfileEntry): SiteProfileEntry => structuredClone(e);

/** Restores page `index` to its shipped version; other pages with its key are dropped. */
export function restorePage(site: Site, index: number): Site {
  const shipped = shippedPages(site)[index];
  if (!shipped) return site;
  const key = pageKey(shipped);
  return {
    ...site,
    profiles: site.profiles.flatMap((e, i) =>
      i === index ? [copy(shipped)] : pageKey(e) === key ? [] : [e],
    ),
  };
}

export interface BuiltinStatus {
  /** Login indicator, a shipped page or its selectors differ from the shipped site. */
  customized: boolean;
  /** Pages the user added to the built-in site. */
  ownPages: SiteProfileEntry[];
}

export function builtinStatus(site: Site): BuiltinStatus | undefined {
  const d = shippedSite(site);
  if (!d) return undefined;
  const links = shippedPages(site);
  const ind = site.loginIndicator;
  const dInd = d.loginIndicator;
  const indicatorChanged =
    ind?.selector !== dInd?.selector || ind?.whenPresent !== dInd?.whenPresent;
  const linked = new Set(links.flatMap((s) => (s ? [pageKey(s)] : [])));
  return {
    customized:
      indicatorChanged ||
      d.profiles.some((p) => !linked.has(pageKey(p))) ||
      site.profiles.some((e, i) => {
        const s = links[i];
        return s !== undefined && isPageCustomized(e, s);
      }),
    ownPages: site.profiles.filter((_, i) => !links[i]),
  };
}

/**
 * Restores a built-in site's pages and login indicator to the shipped ones. The on/off switch
 * and rules are kept; pages the user added are kept (after the shipped ones) or removed.
 */
export function restoreSite(site: Site, keepOwnPages: boolean): Site {
  const d = shippedSite(site);
  if (!d) return site;
  const shipped = d.profiles.map(copy);
  const keys = new Set(shipped.map(pageKey));
  const links = shippedPages(site);
  const own = keepOwnPages
    ? site.profiles.filter((e, i) => !links[i] && !keys.has(pageKey(e)))
    : [];
  return {
    ...site,
    loginIndicator: d.loginIndicator && { ...d.loginIndicator },
    profiles: [...shipped, ...own],
    shippedPages: [...keys],
  };
}
