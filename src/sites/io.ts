import { parseProfile, serializeProfile } from 'feedgrab';
import { cleanParams, migrateLinks } from './links';
import type { Site, View } from './model';

const VIEWS: View[] = ['any', 'loggedIn', 'loggedOut'];
/** A plain hostname (it becomes a match pattern for content scripts and permissions). */
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const ID = /^[\w-]{1,64}$/;

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
  if (!HOSTNAME.test(s.hostname as string)) fail('site.hostname must be a plain hostname');
  if (!ID.test(s.id as string)) fail('site.id may only use letters, digits, _ and -');
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
    profiles: (
      s.profiles as { view: View; profile: unknown; builtinKey?: unknown; links?: unknown }[]
    ).map((e) => {
      if (!VIEWS.includes(e?.view)) fail('profile.view must be any, loggedIn or loggedOut');
      // Post links exported by Ghostify 1.4.6 move onto the feeds before feedgrab validates them.
      const raw = e.links && typeof e.links === 'object' ? migrateLinks(e as never) : e;
      const profile = parseProfile(JSON.stringify((raw as { profile: unknown }).profile));
      return {
        view: e.view,
        profile,
        ...(typeof e.builtinKey === 'string' && { builtinKey: e.builtinKey }),
      };
    }),
    rules: parseRules(s.rules),
    ...parseIgnore(s.ignoreParams),
  };
}

function parseIgnore(raw: unknown): Pick<Site, 'ignoreParams'> {
  if (raw === undefined) return {};
  if (!Array.isArray(raw) || !raw.every((n) => typeof n === 'string' && n.length <= 100))
    fail('site.ignoreParams must be a list of parameter names');
  const names = cleanParams(raw as string[]);
  return names.length ? { ignoreParams: names } : {};
}

function parseRules(raw: unknown): Site['rules'] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail('site.rules must be an array');
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID.test(o.id)) fail('rule.id is malformed');
    if (typeof o.criteria !== 'string' || !o.criteria.trim() || o.criteria.length > 500)
      fail('rule.criteria must be 1-500 characters');
    return { id: o.id, criteria: o.criteria.trim(), enabled: o.enabled !== false };
  });
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

/** Imported sites replace same-id sites (keeping built-in state); new ones are appended. */
export function mergeSites(existing: Site[], incoming: Site[]): Site[] {
  const out = existing.map((s) => {
    const inc = incoming.find((i) => i.id === s.id);
    return inc ? { ...inc, builtin: s.builtin, shippedPages: s.shippedPages } : s;
  });
  return [...out, ...incoming.filter((i) => !existing.some((s) => s.id === i.id))];
}
