import { DEVTO_SITE } from '@/src/sites/defaults';
import { applyPageEdit, pageDraft } from '@/src/sites/edit';
import type { Site } from '@/src/sites/model';
import { ensureDefaultSites, getSites, saveSite } from '@/src/sites/registry';

const site: Site = {
  ...DEVTO_SITE,
  profiles: DEVTO_SITE.profiles.filter((e) => e.view === 'loggedOut'),
};
const top = site.profiles.findIndex((e) => e.profile.pathPattern === '/top/*');
const entry = site.profiles[top];
if (!entry) throw new Error('fixture lacks /top/*');

describe('applyPageEdit', () => {
  it('updates path, view and changed selectors; edited feeds get a new id', () => {
    const d = pageDraft(entry);
    const [first] = d.feeds;
    if (!first) throw new Error('no feed');
    d.pathPattern = ' /top/week ';
    d.view = 'any';
    d.feeds[0] = { ...first, item: { type: 'css', value: '  :scope article ' } };
    const next = applyPageEdit(site, top, d).profiles[top];
    expect(next?.view).toBe('any');
    expect(next?.profile.pathPattern).toBe('/top/week');
    const feed = next?.profile.feeds[0];
    expect(feed?.item.value).toBe(':scope article');
    expect(feed?.id).not.toBe(entry.profile.feeds[0]?.id);
    expect(feed).toMatchObject({ source: 'manual', confirmed: true });
  });

  it('keeps feed ids when selectors are unchanged', () => {
    const next = applyPageEdit(site, top, pageDraft(entry)).profiles[top];
    expect(next?.profile.feeds.map((f) => f.id)).toEqual(entry.profile.feeds.map((f) => f.id));
  });

  it('rejects bad paths, duplicate pages and invalid selectors', () => {
    const edit = (patch: (d: ReturnType<typeof pageDraft>) => void) => {
      const d = pageDraft(entry);
      patch(d);
      return () => applyPageEdit(site, top, d);
    };
    expect(edit((d) => (d.pathPattern = 'top'))).toThrow(/start with \//);
    expect(edit((d) => (d.pathPattern = '/latest'))).toThrow(/already has a page/);
    expect(
      edit((d) => {
        d.pathPattern = '/latest';
        d.view = 'loggedIn';
      }),
    ).not.toThrow();
    const sel = (value: string) =>
      edit((d) => {
        const f = d.feeds[0];
        if (f) d.feeds[0] = { ...f, container: { type: 'css', value } };
      });
    expect(sel(' ')).toThrow(/empty/);
    expect(sel('div[')).toThrow(/not a valid CSS selector/);
  });

  it('edits the link selector, keeping it with a feed whose id changes', () => {
    const id = entry.profile.feeds[0]?.id ?? '';
    const options = [
      { selector: { type: 'css' as const, value: 'a' }, url: 'https://dev.to/a', text: '' },
    ];
    const withLink = {
      ...site,
      profiles: site.profiles.with(top, {
        ...entry,
        links: { [id]: { selector: { type: 'css' as const, value: 'a' }, options } },
      }),
    };
    const d = pageDraft(withLink.profiles[top] ?? entry);
    const [first] = d.feeds;
    if (!first) throw new Error('no feed');
    expect(first.link.value).toBe('a');
    d.feeds[0] = {
      ...first,
      item: { type: 'css', value: 'li' },
      link: { type: 'css', value: ' h2 a ' },
    };
    const next = applyPageEdit(withLink, top, d).profiles[top];
    const newId = next?.profile.feeds[0]?.id ?? '';
    expect(newId).not.toBe(id);
    expect(next?.links).toEqual({ [newId]: { selector: { type: 'css', value: 'h2 a' }, options } });

    d.feeds[0] = { ...first, link: { type: 'css', value: 'a[' } };
    expect(() => applyPageEdit(withLink, top, d)).toThrow(
      /Link selector \(feed 1\) is not a valid CSS/,
    );
    d.feeds[0] = { ...first, link: { type: 'css', value: '' } };
    expect(applyPageEdit(withLink, top, d).profiles[top]?.links?.[id]?.selector.value).toBe('');
    expect(applyPageEdit(site, top, pageDraft(entry)).profiles[top]?.links).toBeUndefined();
  });

  it('survives the built-in selector refresh on startup', async () => {
    const d = pageDraft(entry);
    const [first] = d.feeds;
    if (!first) throw new Error('no feed');
    d.feeds[0] = { ...first, container: { type: 'css', value: '#mine' } };
    await saveSite(applyPageEdit(site, top, d));
    await ensureDefaultSites();
    const page = (await getSites())[0]?.profiles.find((e) => e.profile.pathPattern === '/top/*');
    expect(page?.profile.feeds[0]?.container.value).toBe('#mine');
  });
});
