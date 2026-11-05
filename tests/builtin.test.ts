import { builtinStatus, restorePage, restoreSite, shippedPages } from '@/src/sites/builtin';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { applyPageEdit, pageDraft } from '@/src/sites/edit';
import { pageKey, type Site } from '@/src/sites/model';

const shipped = structuredClone(DEVTO_SITE);
const keys = shipped.profiles.map(pageKey);
const top = shipped.profiles.findIndex((e) => e.profile.pathPattern === '/top/*');
const topEntry = shipped.profiles[top];
if (!topEntry) throw new Error('fixture lacks /top/*');
const own = {
  ...structuredClone(topEntry),
  profile: { ...topEntry.profile, pathPattern: '/mine' },
};

const edited = (): Site => {
  const d = pageDraft(topEntry);
  d.pathPattern = '/top/week';
  const [f] = d.feeds;
  if (f) d.feeds[0] = { ...f, container: { type: 'css', value: '#mine' } };
  return applyPageEdit(shipped, top, d);
};

describe('built-in restore', () => {
  it('reports a shipped site as not customized and other sites as not built-in', () => {
    expect(builtinStatus(shipped)).toEqual({ customized: false, ownPages: [] });
    expect(shippedPages(shipped).every(Boolean)).toBe(true);
    expect(builtinStatus({ ...shipped, id: 'ex', builtin: false })).toBeUndefined();
  });

  it('keeps an edited page linked to its shipped page and restores it', () => {
    const site = edited();
    expect(site.profiles[top]?.builtinKey).toBe(pageKey(topEntry));
    expect(shippedPages(site)[top]).toBe(DEVTO_SITE.profiles[top]);
    expect(builtinStatus(site)?.customized).toBe(true);
    const back = restorePage(site, top);
    expect(back.profiles.map(pageKey)).toEqual(keys);
    expect(back.profiles[top]?.profile.feeds).toEqual(topEntry.profile.feeds);
    expect(builtinStatus(back)?.customized).toBe(false);
  });

  it('flags a page whose link selector was set, and restoring drops it', () => {
    const d = pageDraft(topEntry as NonNullable<typeof topEntry>);
    const [first] = d.feeds;
    if (!first) throw new Error('no feed');
    d.feeds[0] = { ...first, link: { type: 'css', value: 'h2 a' } };
    const site = applyPageEdit(shipped, top, d);
    expect(builtinStatus(site)?.customized).toBe(true);
    expect(restorePage(site, top).profiles[top]?.links).toBeUndefined();
  });

  it('flags a changed indicator or a removed shipped page', () => {
    const ind = {
      ...shipped,
      loginIndicator: { selector: '#x', whenPresent: 'loggedIn' as const },
    };
    expect(builtinStatus(ind)?.customized).toBe(true);
    const removed = { ...shipped, profiles: shipped.profiles.filter((_, i) => i !== top) };
    expect(builtinStatus(removed)?.customized).toBe(true);
  });

  it('restores the site, keeping or removing own pages, rules and the switch', () => {
    const rules = [{ id: 'r1', criteria: 'crypto', enabled: true }];
    const site: Site = {
      ...edited(),
      enabled: false,
      rules,
      loginIndicator: undefined,
      profiles: [...edited().profiles.filter((_, i) => i !== 0), own],
    };
    expect(builtinStatus(site)?.ownPages).toEqual([own]);

    const kept = restoreSite(site, true);
    expect(kept.profiles.map(pageKey)).toEqual([...keys, pageKey(own)]);
    expect(kept).toMatchObject({
      enabled: false,
      rules,
      loginIndicator: DEVTO_SITE.loginIndicator,
    });
    expect(builtinStatus(kept)).toEqual({ customized: false, ownPages: [own] });

    const removed = restoreSite(site, false);
    expect(removed.profiles).toEqual(DEVTO_SITE.profiles);
    expect(builtinStatus(removed)).toEqual({ customized: false, ownPages: [] });
  });
});
