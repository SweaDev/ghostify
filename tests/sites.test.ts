import { DEVTO_SITE, LEGACY_DEVTO_INDICATOR } from '@/src/sites/defaults';
import { detectView, pageKey, resolveProfile } from '@/src/sites/model';
import { ensureDefaultSites, getSites, saveSite } from '@/src/sites/registry';
import { DEFAULT_SETTINGS, getSettings } from '@/src/store/settings';

function doc(status: 'logged-in' | 'logged-out'): Document {
  const d = document.implementation.createHTMLDocument('t');
  if (status === 'logged-in') d.body.innerHTML = '<img id="nav-profile-image">';
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

  it.each([
    '/',
    '/discover',
    '/following',
    '/following/latest',
    '/curated',
    '/latest',
    '/latest_less_filtered',
    '/top/week',
  ])('matches the logged-in home feed %s', (path) => {
    const r = resolveProfile(sites, `https://dev.to${path}`, doc('logged-in'));
    expect(r?.view).toBe('loggedIn');
    expect(r?.profile.feeds[0]?.id).toBe('devto-stories-logged-in');
  });

  it('ignores article pages', () => {
    expect(resolveProfile(sites, 'https://dev.to/someone/a-post-1abc', doc('logged-out'))).toBe(
      undefined,
    );
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

  it('adds the logged-in view once to installs with the legacy indicator', async () => {
    const legacy = structuredClone(DEVTO_SITE);
    legacy.loginIndicator = { selector: LEGACY_DEVTO_INDICATOR, whenPresent: 'loggedIn' };
    legacy.profiles = legacy.profiles.filter((e) => e.view === 'loggedOut');
    delete legacy.shippedPages;
    await saveSite(legacy);
    await ensureDefaultSites();
    expect((await getSites())[0]).toEqual(DEVTO_SITE);

    // Removed logged-in pages stay removed after the migration.
    await saveSite({ ...DEVTO_SITE, profiles: DEVTO_SITE.profiles.slice(0, -1) });
    await ensureDefaultSites();
    expect((await getSites())[0]?.profiles).toHaveLength(DEVTO_SITE.profiles.length - 1);
  });

  it('adds newly shipped pages once to installs that predate them', async () => {
    const old = structuredClone(DEVTO_SITE);
    old.profiles = old.profiles.filter(
      (e) => e.view === 'loggedOut' || e.profile.pathPattern === '/',
    );
    old.shippedPages = old.profiles.map(pageKey);
    old.shippedPages.push('loggedIn:/latest'); // given before and removed by the user
    await saveSite(old);
    await ensureDefaultSites();
    const paths = (await getSites())[0]?.profiles
      .filter((e) => e.view === 'loggedIn')
      .map((e) => e.profile.pathPattern);
    expect(paths).toContain('/discover');
    expect(paths).toContain('/following/latest');
    expect(paths).not.toContain('/latest');
    expect((await getSites())[0]?.shippedPages).toEqual(DEVTO_SITE.shippedPages);
  });

  it('gives installs without a record every missing shipped page', async () => {
    const old = structuredClone(DEVTO_SITE);
    old.profiles = old.profiles.filter(
      (e) => e.view === 'loggedOut' || e.profile.pathPattern === '/',
    );
    delete old.shippedPages;
    await saveSite(old);
    await ensureDefaultSites();
    expect((await getSites())[0]?.profiles.map(pageKey).sort()).toEqual(
      DEVTO_SITE.profiles.map(pageKey).sort(),
    );
  });
});

describe('settings', () => {
  it('fills defaults', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
