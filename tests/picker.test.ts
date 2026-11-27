import type { SiteProfile } from 'feedgrab';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handlers } from '@/src/background/handlers';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { existingProfile, findSite, mergePicked } from '@/src/sites/picker';

const profile = (host: string, pathPattern: string): SiteProfile => ({
  version: 1,
  hostname: host,
  pathPattern,
  feeds: [],
});

describe('picker merge', () => {
  it('creates a new site from the first profile', () => {
    const s = mergePicked([], 'www.news.example', 'News', {
      profile: profile('www.news.example', '/'),
      view: 'any',
    });
    expect(s).toMatchObject({
      id: 'news-example',
      hostname: 'news.example',
      label: 'News',
      enabled: true,
      builtin: false,
    });
    expect(s.profiles[0]?.profile.hostname).toBe('news.example');
  });

  it('replaces same view + path and keeps others, enabling the site', () => {
    const site = { ...DEVTO_SITE, enabled: false };
    const merged = mergePicked([site], 'dev.to', 'DEV', {
      profile: { ...profile('dev.to', '/latest'), feeds: [] },
      view: 'loggedOut',
    });
    expect(merged.enabled).toBe(true);
    expect(merged.ignoreParams).toBeUndefined();
    const again = mergePicked([merged], 'dev.to', 'DEV', {
      profile: { ...profile('dev.to', '/latest'), feeds: [] },
      view: 'loggedOut',
      ignoreParams: ['pp'],
    });
    expect(again.ignoreParams).toEqual(['pp']);
    const cleared = mergePicked([again], 'dev.to', 'DEV', {
      profile: { ...profile('dev.to', '/latest'), feeds: [] },
      view: 'loggedOut',
      ignoreParams: [],
    });
    expect(cleared.ignoreParams).toBeUndefined();
    expect(merged.profiles.map((e) => `${e.view} ${e.profile.pathPattern}`)).toEqual([
      'loggedOut /',
      'loggedOut /top/*',
      'loggedIn /',
      'loggedIn /discover',
      'loggedIn /following',
      'loggedIn /following/latest',
      'loggedIn /curated',
      'loggedIn /latest',
      'loggedIn /latest_less_filtered',
      'loggedIn /top/*',
      'loggedOut /latest',
    ]);
    expect(merged.profiles.at(-1)?.profile.feeds).toEqual([]);

    const withIn = mergePicked([site], 'dev.to', 'DEV', {
      profile: profile('dev.to', '/'),
      view: 'loggedIn',
      indicator: { selector: '#me', whenPresent: 'loggedIn' },
    });
    expect(withIn.profiles).toHaveLength(DEVTO_SITE.profiles.length);
    expect(withIn.loginIndicator?.selector).toBe('#me');
  });

  it('finds sites and existing profiles', () => {
    expect(findSite([DEVTO_SITE], 'www.dev.to')?.id).toBe('devto');
    expect(existingProfile(DEVTO_SITE, 'https://dev.to/top/week', 'loggedOut')?.pathPattern).toBe(
      '/top/*',
    );
    expect(existingProfile(DEVTO_SITE, 'https://dev.to/', 'loggedIn')?.feeds[0]?.id).toBe(
      'devto-stories-logged-in',
    );
    expect(existingProfile(DEVTO_SITE, 'https://dev.to/tags', 'loggedIn')).toBeUndefined();
  });
});

describe('addSite handler', () => {
  it('gives the tab a one-time grab token, then injects the picker script', async () => {
    const executeScript = vi.fn(async () => []);
    Object.assign(fakeBrowser, { scripting: { executeScript } });
    await handlers.addSite({ tabId: 7 });
    const token = (await fakeBrowser.storage.session.get('grab:7'))['grab:7'];
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(executeScript).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ target: { tabId: 7 }, args: [{ token, tabId: 7 }] }),
    );
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 7 },
      files: ['/content-scripts/picker.js'],
    });
  });

  it('opens the panel window only for the tab that holds the token', async () => {
    const create = vi.spyOn(fakeBrowser.windows, 'create').mockResolvedValue({} as never);
    await fakeBrowser.storage.session.set({ 'grab:7': 'secret' });
    await handlers.openGrabWindow({ token: 'wrong', tabId: 7 });
    expect(create).not.toHaveBeenCalled();
    await handlers.openGrabWindow({ token: 'secret', tabId: 7 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popup',
        url: expect.stringContaining('grab-window.html?tab=7&token=secret'),
      }),
    );
  });
});
