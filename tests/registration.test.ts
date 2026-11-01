import { DEVTO_SITE } from '@/src/sites/defaults';
import type { Site } from '@/src/sites/model';
import { type RegistrationApi, siteOrigins, syncRegistrations } from '@/src/sites/registration';

const site = (id: string, extra: Partial<Site> = {}): Site => ({
  ...DEVTO_SITE,
  id,
  hostname: `${id}.test`,
  label: id,
  builtin: false,
  ...extra,
});

function fakeApi(granted: string[], registered: { id: string; matches: string[] }[] = []) {
  const scripts = [...registered];
  const api = {
    permissions: {
      contains: vi.fn(async ({ origins }: { origins?: string[] }) =>
        (origins ?? []).every((o) => granted.includes(o)),
      ),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => scripts.map((s) => ({ ...s, js: [] }))),
      registerContentScripts: vi.fn(async (list: { id: string; matches?: string[] }[]) => {
        for (const s of list) scripts.push({ id: s.id, matches: s.matches ?? [] });
      }),
      unregisterContentScripts: vi.fn(async ({ ids }: { ids?: string[] } = {}) => {
        for (const id of ids ?? [])
          scripts.splice(
            scripts.findIndex((s) => s.id === id),
            1,
          );
      }),
    },
  };
  return { api: api as unknown as RegistrationApi, scripts, raw: api };
}

describe('siteOrigins', () => {
  it('adds the www variant', () => {
    expect(siteOrigins(site('a'))).toEqual(['*://a.test/*', '*://www.a.test/*']);
    expect(siteOrigins(site('b', { hostname: 'www.b.test' }))).toEqual(['*://www.b.test/*']);
  });
});

describe('syncRegistrations', () => {
  it('registers enabled user sites with permission, skipping built-ins', async () => {
    const { api, scripts } = fakeApi([...siteOrigins(site('a')), ...siteOrigins(site('b'))]);
    await syncRegistrations([DEVTO_SITE, site('a'), site('b', { enabled: false }), site('c')], api);
    expect(scripts.map((s) => s.id)).toEqual(['site-a']);
  });

  it('unregisters disabled/deleted sites and keeps unchanged ones', async () => {
    const a = site('a');
    const { api, scripts, raw } = fakeApi(siteOrigins(a), [
      { id: 'site-a', matches: siteOrigins(a) },
      { id: 'site-gone', matches: ['*://gone.test/*'] },
    ]);
    await syncRegistrations([a], api);
    expect(scripts.map((s) => s.id)).toEqual(['site-a']);
    expect(raw.scripting.registerContentScripts).not.toHaveBeenCalled();
    await syncRegistrations([{ ...a, enabled: false }], api);
    expect(scripts).toEqual([]);
  });

  it('re-registers when the hostname changes', async () => {
    const a = site('a');
    const moved = { ...a, hostname: 'new.test' };
    const { api, scripts } = fakeApi(siteOrigins(moved), [
      { id: 'site-a', matches: siteOrigins(a) },
    ]);
    await syncRegistrations([moved], api);
    expect(scripts).toEqual([{ id: 'site-a', matches: siteOrigins(moved) }]);
  });
});
