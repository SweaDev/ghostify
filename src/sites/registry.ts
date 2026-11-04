import { storage } from 'wxt/utils/storage';
import { DEFAULT_SITES, LEGACY_DEVTO_INDICATOR } from './defaults';
import type { Site } from './model';

export const sitesItem = storage.defineItem<Site[]>('local:sites', { fallback: DEFAULT_SITES });

export const getSites = () => sitesItem.getValue();

const BUILTIN_FEEDS = new Map(
  DEFAULT_SITES.flatMap((s) => s.profiles.flatMap((e) => e.profile.feeds)).map((f) => [f.id, f]),
);

/** Updates the selectors of built-in feeds to the shipped ones (sites change their markup). */
function refreshBuiltin(site: Site): Site {
  if (!site.builtin) return site;
  const profiles = site.profiles.map((e) => ({
    ...e,
    profile: {
      ...e.profile,
      feeds: e.profile.feeds.map((f) => {
        const d = BUILTIN_FEEDS.get(f.id);
        return d ? { ...f, container: d.container, item: d.item } : f;
      }),
    },
  }));
  return migrateLoggedIn({ ...site, profiles });
}

/**
 * One-time upgrade of installs from before the built-in logged-in view: swaps the old
 * login indicator for the shipped one and adds the shipped logged-in profiles.
 */
function migrateLoggedIn(site: Site): Site {
  const d = DEFAULT_SITES.find((s) => s.id === site.id);
  if (!d || site.loginIndicator?.selector !== LEGACY_DEVTO_INDICATOR) return site;
  const has = (e: Site['profiles'][number]) =>
    site.profiles.some((s) => s.view === e.view && s.profile.pathPattern === e.profile.pathPattern);
  const added = d.profiles.filter((e) => e.view === 'loggedIn' && !has(e));
  return {
    ...site,
    loginIndicator: d.loginIndicator,
    profiles: [...site.profiles, ...added],
  };
}

/**
 * Adds built-in sites that are missing from storage and refreshes built-in feed selectors.
 * Other user edits (enabled, rules, removed or picked pages) are kept.
 */
export async function ensureDefaultSites(): Promise<void> {
  const stored = await storage.getItem<Site[]>('local:sites');
  const sites = (stored ?? []).map(refreshBuiltin);
  const missing = DEFAULT_SITES.filter((d) => !sites.some((s) => s.id === d.id));
  const next = [...sites, ...missing];
  if (JSON.stringify(next) !== JSON.stringify(stored)) await sitesItem.setValue(next);
}

export async function saveSite(site: Site): Promise<void> {
  const sites = await getSites();
  const i = sites.findIndex((s) => s.id === site.id);
  await sitesItem.setValue(i === -1 ? [...sites, site] : sites.with(i, site));
}

export async function deleteSite(id: string): Promise<void> {
  await sitesItem.setValue((await getSites()).filter((s) => s.id !== id || s.builtin));
}
