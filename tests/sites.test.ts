import { DEVTO_SITE } from '@/src/sites/defaults';
import { detectView, resolveProfile } from '@/src/sites/model';
import { ensureDefaultSites, getSites, saveSite } from '@/src/sites/registry';
import { DEFAULT_SETTINGS, getSettings } from '@/src/store/settings';

function doc(status: 'logged-in' | 'logged-out'): Document {
  const d = document.implementation.createHTMLDocument('t');
  d.body.dataset.userStatus = status;
  return d;
}

describe('detectView', () => {
  it('reads the dev.to login indicator', () => {
    expect(detectView(DEVTO_SITE, doc('logged-in'))).toBe('loggedIn');
    expect(detectView(DEVTO_SITE, doc('logged-out'))).toBe('loggedOut');
  });

  it('is undefined without an indicator', () => {
    expect(detectView({ ...DEVTO_SITE, loginIndicator: undefined }, doc('logged-in'))).toBe(
      undefined,
    );
  });
});

describe('resolveProfile', () => {
  const sites = [DEVTO_SITE];
  it.each(['https://dev.to/', 'https://dev.to/latest', 'https://dev.to/top/week'])(
    'matches logged-out home feed %s',
    (url) => {
      const r = resolveProfile(sites, url, doc('logged-out'));
      expect(r?.site.id).toBe('devto');
      expect(r?.view).toBe('loggedOut');
      expect(r?.profile.feeds.length).toBeGreaterThan(0);
    },
  );

  it('ignores article pages and the logged-in view', () => {
    expect(resolveProfile(sites, 'https://dev.to/someone/a-post-1abc', doc('logged-out'))).toBe(
      undefined,
    );
    expect(resolveProfile(sites, 'https://dev.to/', doc('logged-in'))).toBe(undefined);
  });

  it('skips disabled sites', () => {
    expect(
      resolveProfile([{ ...DEVTO_SITE, enabled: false }], 'https://dev.to/', doc('logged-out')),
    ).toBe(undefined);
  });
});

describe('sites storage', () => {
  it('falls back to and seeds the default sites', async () => {
    expect((await getSites()).map((s) => s.id)).toEqual(['devto']);
    await ensureDefaultSites();
    await saveSite({ ...DEVTO_SITE, id: 'x', hostname: 'x.test', builtin: false });
    await ensureDefaultSites();
    expect((await getSites()).map((s) => s.id)).toEqual(['devto', 'x']);
  });
});

describe('built-in selector refresh', () => {
  it('updates stored built-in feed selectors and keeps user edits', async () => {
    const stale = structuredClone(DEVTO_SITE);
    for (const e of stale.profiles)
      for (const f of e.profile.feeds) f.item = { type: 'css', value: ':scope > .old' };
    await saveSite({ ...stale, enabled: false, profiles: stale.profiles.slice(1) });
    await ensureDefaultSites();
    const [site] = await getSites();
    expect(site?.enabled).toBe(false);
    expect(site?.profiles).toEqual(DEVTO_SITE.profiles.slice(1));
  });
});

describe('settings', () => {
  it('fills defaults', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
