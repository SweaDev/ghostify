import { parseProfile, serializeProfile } from 'feedgrab';
import type { Site, View } from './model';

const VIEWS: View[] = ['any', 'loggedIn', 'loggedOut'];

function fail(msg: string): never {
  throw new Error(`Invalid sites file: ${msg}`);
}

/** Validates one site; profiles go through feedgrab's own schema and migrations. */
export function parseSite(raw: unknown): Site {
  if (!raw || typeof raw !== 'object') fail('site is not an object');
  const s = raw as Record<string, unknown>;
  for (const k of ['id', 'hostname', 'label'] as const) {
    if (typeof s[k] !== 'string' || !s[k]) fail(`site.${k} must be a non-empty string`);
  }
  if (!Array.isArray(s.profiles)) fail('site.profiles must be an array');
  const ind = s.loginIndicator as Site['loginIndicator'];
  if (
    ind &&
    (typeof ind.selector !== 'string' || !['loggedIn', 'loggedOut'].includes(ind.whenPresent))
  )
    fail('site.loginIndicator is malformed');
  return {
    id: s.id as string,
    hostname: s.hostname as string,
    label: s.label as string,
    enabled: s.enabled !== false,
    builtin: false,
    loginIndicator: ind,
    profiles: (s.profiles as { view: View; profile: unknown }[]).map((e) => {
      if (!VIEWS.includes(e?.view)) fail('profile.view must be any, loggedIn or loggedOut');
      return { view: e.view, profile: parseProfile(JSON.stringify(e.profile)) };
    }),
    rules: Array.isArray(s.rules) ? (s.rules as Site['rules']) : [],
  };
}

export function parseSitesJson(text: string): Site[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('not JSON');
  }
  if (!Array.isArray(data)) fail('expected an array of sites');
  return data.map(parseSite);
}

export function serializeSites(sites: Site[]): string {
  return JSON.stringify(
    sites.map((s) => ({
      ...s,
      profiles: s.profiles.map((e) => ({ ...e, profile: JSON.parse(serializeProfile(e.profile)) })),
    })),
    null,
    2,
  );
}

/** Imported sites replace same-id sites (keeping built-in flags); new ones are appended. */
export function mergeSites(existing: Site[], incoming: Site[]): Site[] {
  const out = existing.map((s) => {
    const inc = incoming.find((i) => i.id === s.id);
    return inc ? { ...inc, builtin: s.builtin } : s;
  });
  return [...out, ...incoming.filter((i) => !existing.some((s) => s.id === i.id))];
}
