import type { SiteProfile } from 'feedgrab';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handlers } from '@/src/background/handlers';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { existingProfile, findSite, mergePicked } from '@/src/sites/picker';
import { chooseView } from '@/src/sites/view-chooser';

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
    expect(merged.profiles.map((e) => `${e.view} ${e.profile.pathPattern}`)).toEqual([
      'loggedOut /',
      'loggedOut /top/*',
      'loggedIn /',
      'loggedIn /latest',
      'loggedIn /top/*',
      'loggedOut /latest',
    ]);
    expect(merged.profiles.at(-1)?.profile.feeds).toEqual([]);

    const withIn = mergePicked([site], 'dev.to', 'DEV', {
      profile: profile('dev.to', '/'),
      view: 'loggedIn',
      indicator: { selector: '#me', whenPresent: 'loggedIn' },
    });
    expect(withIn.profiles).toHaveLength(6);
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

describe('view chooser', () => {
  const root = () => document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;

  it('resolves the chosen view with a picked indicator', async () => {
    const p = chooseView(document, { pickIndicator: async () => '#avatar' });
    const loggedIn = root().querySelector('input[value=loggedIn]') as HTMLInputElement;
    loggedIn.checked = true;
    loggedIn.dispatchEvent(new Event('change'));
    (root().querySelector('.pick') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root().querySelector('.sel')?.textContent).toContain('#avatar'));
    (root().querySelector('.save') as HTMLButtonElement).click();
    expect(await p).toEqual({
      view: 'loggedIn',
      indicator: { selector: '#avatar', whenPresent: 'loggedIn' },
    });
    expect(document.querySelector('[data-ghostify-chooser]')).toBeNull();
  });

  it('resolves null on cancel', async () => {
    const p = chooseView(document);
    (root().querySelector('.cancel') as HTMLButtonElement).click();
    expect(await p).toBeNull();
  });
});

describe('addSite handler', () => {
  it('injects the picker script into the tab', async () => {
    const executeScript = vi.fn(async () => []);
    Object.assign(fakeBrowser, { scripting: { executeScript } });
    await handlers.addSite({ tabId: 7 });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/content-scripts/picker.js'],
    });
  });
});
