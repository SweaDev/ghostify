import { browser } from 'wxt/browser';
import type { Site } from './model';

/** The WXT-built bundle of `entrypoints/feed.content.ts`. */
export const FEED_SCRIPT = 'content-scripts/feed.js';

export type RegistrationApi = {
  scripting: Pick<
    typeof browser.scripting,
    'getRegisteredContentScripts' | 'registerContentScripts' | 'unregisterContentScripts'
  >;
  permissions: Pick<typeof browser.permissions, 'contains'>;
};

export const scriptId = (site: Site) => `site-${site.id}`;

/** Match patterns (and permission origins) for a site, including its `www.` variant. */
export function siteOrigins(site: Site): string[] {
  const h = site.hostname;
  return h.startsWith('www.') ? [`*://${h}/*`] : [`*://${h}/*`, `*://www.${h}/*`];
}

/**
 * Registers the feed content script for every enabled, user-added site whose host permission is
 * granted, and unregisters the rest. Built-in sites use static manifest content scripts.
 */
export async function syncRegistrations(
  sites: Site[],
  api: RegistrationApi = browser,
): Promise<void> {
  const wanted = new Map<string, string[]>();
  for (const s of sites) {
    if (!s.enabled || s.builtin) continue;
    const origins = siteOrigins(s);
    if (await api.permissions.contains({ origins })) wanted.set(scriptId(s), origins);
  }
  const registered = (await api.scripting.getRegisteredContentScripts()).filter((r) =>
    r.id.startsWith('site-'),
  );
  const stale = registered.filter((r) => {
    const want = wanted.get(r.id);
    return !want || want.join() !== (r.matches ?? []).join();
  });
  if (stale.length) await api.scripting.unregisterContentScripts({ ids: stale.map((r) => r.id) });
  const keep = new Set(registered.filter((r) => !stale.includes(r)).map((r) => r.id));
  const add = [...wanted].filter(([id]) => !keep.has(id));
  if (add.length) {
    await api.scripting.registerContentScripts(
      add.map(([id, matches]) => ({
        id,
        matches,
        js: [FEED_SCRIPT],
        runAt: 'document_idle' as const,
      })),
    );
  }
}
