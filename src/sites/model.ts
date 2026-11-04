import { matchProfile, type SiteProfile } from 'feedgrab';

/** Which page view a profile applies to. `any` profiles match in both views. */
export type View = 'any' | 'loggedIn' | 'loggedOut';

/** A selector whose presence tells the logged-in view from the logged-out one. */
export interface LoginIndicator {
  selector: string;
  whenPresent: 'loggedIn' | 'loggedOut';
}

export interface SiteProfileEntry {
  view: View;
  profile: SiteProfile;
}

/** Plain-language auto-ghostify rule (used when AI is on). */
export interface SiteRule {
  id: string;
  criteria: string;
  enabled: boolean;
}

export interface Site {
  id: string;
  hostname: string;
  label: string;
  enabled: boolean;
  builtin: boolean;
  loginIndicator?: LoginIndicator;
  profiles: SiteProfileEntry[];
  rules: SiteRule[];
  /**
   * Built-in sites only: `pageKey`s of the shipped pages this install has already been given,
   * so pages added in an update are added once and pages the user removed stay removed.
   */
  shippedPages?: string[];
}

/** Identifies a site page by view and path. */
export const pageKey = (e: SiteProfileEntry) => `${e.view}:${e.profile.pathPattern}`;

export interface ResolvedProfile {
  site: Site;
  view: View;
  profile: SiteProfile;
}

/** The current view per the site's login indicator, or undefined without one. */
export function detectView(site: Site, doc: Document): 'loggedIn' | 'loggedOut' | undefined {
  const ind = site.loginIndicator;
  if (!ind) return undefined;
  let present = false;
  try {
    present = doc.querySelector(ind.selector) !== null;
  } catch {
    return undefined;
  }
  const other = ind.whenPresent === 'loggedIn' ? 'loggedOut' : 'loggedIn';
  return present ? ind.whenPresent : other;
}

export function hostMatches(siteHost: string, host: string): boolean {
  return host === siteHost || host === `www.${siteHost}`;
}

export function siteForUrl(sites: Site[], url: string | URL): Site | undefined {
  const host = new URL(url).hostname;
  return sites.find((s) => s.enabled && hostMatches(s.hostname, host));
}

/**
 * Picks the site, view and most specific feedgrab profile for a page. Without a login
 * indicator every profile is a candidate; with one, only `any` and the detected view.
 */
export function resolveProfile(
  sites: Site[],
  url: string | URL,
  doc: Document,
): ResolvedProfile | undefined {
  const site = siteForUrl(sites, url);
  if (!site) return undefined;
  const detected = detectView(site, doc);
  const entries = site.profiles.filter((e) => !detected || e.view === 'any' || e.view === detected);
  // feedgrab matches on the profile's hostname; normalize www. variants to the page host.
  const host = new URL(url).hostname;
  const candidates = entries.map((e) => ({ ...e.profile, hostname: host }));
  const profile = matchProfile(url, candidates);
  if (!profile) return undefined;
  const entry = entries[candidates.indexOf(profile)];
  return entry && { site, view: entry.view, profile };
}
