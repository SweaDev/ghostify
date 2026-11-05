import { matchProfile, type SiteProfile } from 'feedgrab';
import type { ItemLinks } from './links';
import {
  hostMatches,
  type LoginIndicator,
  type Site,
  type SiteProfileEntry,
  type View,
} from './model';

export const bareHost = (host: string) => host.replace(/^www\./, '');

/** The site for a host, if any (enabled or not). */
export function findSite(sites: Site[], host: string): Site | undefined {
  return sites.find((s) => hostMatches(s.hostname, host));
}

/** The stored page that would apply to `url` in `view` (for editing it in the overlay). */
export function existingEntry(
  site: Site | undefined,
  url: string,
  view: View,
): SiteProfileEntry | undefined {
  if (!site) return undefined;
  const host = new URL(url).hostname;
  const entries = site.profiles.filter((e) => e.view === view);
  const candidates = entries.map((e) => ({ ...e.profile, hostname: host }));
  const match = matchProfile(url, candidates);
  return match && entries[candidates.indexOf(match)];
}

export const existingProfile = (
  site: Site | undefined,
  url: string,
  view: View,
): SiteProfile | undefined => existingEntry(site, url, view)?.profile;

export interface PickResult {
  profile: SiteProfile;
  view: View;
  indicator?: LoginIndicator;
  links?: ItemLinks;
}

/**
 * Adds or replaces (same view and path pattern) a confirmed overlay profile on the site for the
 * page's host, creating the site when needed.
 */
export function mergePicked(sites: Site[], host: string, label: string, r: PickResult): Site {
  const hostname = bareHost(host);
  const site: Site = findSite(sites, host) ?? {
    id: hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    hostname,
    label: label || hostname,
    enabled: true,
    builtin: false,
    profiles: [],
    rules: [],
  };
  const profile = {
    ...r.profile,
    hostname,
    updatedAt: r.profile.updatedAt ?? new Date().toISOString(),
  };
  const profiles = site.profiles.filter(
    (e) => !(e.view === r.view && e.profile.pathPattern === profile.pathPattern),
  );
  return {
    ...site,
    enabled: true,
    loginIndicator: r.indicator ?? site.loginIndicator,
    profiles: [
      ...profiles,
      {
        view: r.view,
        profile,
        ...(r.links && Object.keys(r.links).length > 0 && { links: r.links }),
      },
    ],
  };
}
