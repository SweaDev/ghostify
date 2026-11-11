import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { applyPageEdit, pageDraft } from '@/src/sites/edit';
import { mergeSites, parseSitesJson, serializeSites } from '@/src/sites/io';
import { ensureDefaultSites, getSites, saveSite, sitesItem } from '@/src/sites/registry';
import { getSamples, saveSample } from '@/src/store/samples';
import { SitesSettings } from '@/src/ui/SitesSettings';

afterEach(cleanup);
const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const custom = {
  ...DEVTO_SITE,
  id: 'ex',
  hostname: 'example.com',
  label: 'Example',
  builtin: false,
  profiles: DEVTO_SITE.profiles.filter((e) => e.view === 'loggedOut'),
};

describe('sites io', () => {
  it('round-trips and validates profiles with feedgrab', () => {
    const parsed = parseSitesJson(serializeSites([custom]));
    expect(parsed[0]?.profiles.map((p) => p.profile.pathPattern)).toEqual([
      '/',
      '/latest',
      '/top/*',
    ]);
    expect(() => parseSitesJson('{}')).toThrow(/array/);
    expect(() =>
      parseSitesJson('[{"id":"a","hostname":"h","label":"l","profiles":[{"view":"x"}]}]'),
    ).toThrow(/view/);
    expect(() =>
      parseSitesJson(
        '[{"id":"a","hostname":"h","label":"l","profiles":[{"view":"any","profile":{}}]}]',
      ),
    ).toThrow();
  });

  it('round-trips post links and migrates the 1.4.6 links field', async () => {
    const [first] = custom.profiles;
    const feed = first?.profile.feeds[0];
    if (!first || !feed) throw new Error('no page');
    const permalink = { type: 'css' as const, value: 'a:has(time)' };
    const linked = { ...first, profile: { ...first.profile, feeds: [{ ...feed, permalink }] } };
    const site = { ...custom, profiles: [linked] };
    expect(
      parseSitesJson(serializeSites([site]))[0]?.profiles[0]?.profile.feeds[0]?.permalink,
    ).toEqual(permalink);
    const bad = {
      ...linked.profile,
      feeds: [{ ...feed, permalink: { type: 'regex', value: 'a' } }],
    };
    expect(() =>
      parseSitesJson(JSON.stringify([{ ...site, profiles: [{ ...linked, profile: bad }] }])),
    ).toThrow();

    const legacy = { ...first, links: { [feed.id]: { selector: permalink, options: [] } } };
    const imported = parseSitesJson(JSON.stringify([{ ...site, profiles: [legacy] }]))[0];
    expect(imported?.profiles[0]).not.toHaveProperty('links');
    expect(imported?.profiles[0]?.profile.feeds[0]?.permalink).toEqual(permalink);

    await sitesItem.setValue([{ ...custom, profiles: [legacy] } as never]);
    await ensureDefaultSites();
    const stored = (await getSites()).find((s) => s.id === 'ex')?.profiles[0];
    expect(stored).not.toHaveProperty('links');
    expect(stored?.profile.feeds[0]?.permalink).toEqual(permalink);
  });

  it('merges by id, keeping built-in flags', () => {
    const merged = mergeSites(
      [DEVTO_SITE],
      [{ ...DEVTO_SITE, enabled: false, builtin: false }, custom],
    );
    expect(merged.map((s) => [s.id, s.builtin, s.enabled])).toEqual([
      ['devto', true, false],
      ['ex', false, true],
    ]);
  });
});

describe('SitesSettings', () => {
  it('lists sites with links to their pages and filters by search', async () => {
    await saveSite(custom);
    render(<SitesSettings />);
    const link = (await screen.findByText('Example')).closest('a');
    expect(link?.getAttribute('href')).toBe('#sites/ex');
    await click(screen.getByRole('switch', { name: 'Enable DEV Community' }));
    await vi.waitFor(async () => expect((await getSites())[0]?.enabled).toBe(false));

    const search = screen.getByLabelText('Search sites');
    fireEvent.change(search, { target: { value: 'EXAMPLE.com' } });
    expect(screen.queryByText('DEV Community')).toBeNull();
    expect(screen.getByText('Example')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(screen.getByText(/No sites match/)).toBeTruthy();
  });

  it('edits a site on its own page and deletes custom sites', async () => {
    await saveSite(custom);
    const { rerender } = render(<SitesSettings sub="devto" />);
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs.querySelector('a')?.getAttribute('href')).toBe('#sites');
    expect(screen.queryByText('Delete site')).toBeNull();

    rerender(<SitesSettings sub="ex" />);
    const sel = await screen.findByLabelText('Login indicator selector');
    fireEvent.change(sel, { target: { value: '#me' } });
    fireEvent.blur(sel);
    await vi.waitFor(async () =>
      expect((await getSites())[1]?.loginIndicator).toEqual({
        selector: '#me',
        whenPresent: 'loggedIn',
      }),
    );
    expect(screen.getByText('/top/*')).toBeTruthy();
    await click(screen.getByLabelText('Remove /top/*'));
    await vi.waitFor(async () => expect((await getSites())[1]?.profiles).toHaveLength(2));

    window.confirm = () => true;
    await click(screen.getByText('Delete site'));
    await vi.waitFor(async () => expect((await getSites()).map((s) => s.id)).toEqual(['devto']));
    expect(location.hash).toBe('#sites');
  });

  it('edits a page path and selectors by hand', async () => {
    await saveSite(custom);
    render(<SitesSettings sub="ex" />);
    const edit = await screen.findByLabelText('Edit /top/*');
    const remove = screen.getByLabelText('Remove /top/*');
    expect(edit.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(edit);
    const form = screen.getByRole('form', { name: 'Edit /top/*' });
    const item = within(form).getAllByLabelText(/item selector$/i)[0] as HTMLElement;
    fireEvent.change(item, { target: { value: 'div[' } });
    await act(async () => void fireEvent.submit(form));
    expect(within(form).getByRole('alert').textContent).toMatch(/not a valid CSS/);

    fireEvent.change(item, { target: { value: ':scope article' } });
    fireEvent.change(within(form).getByLabelText('Path pattern'), {
      target: { value: '/top/week' },
    });
    await act(async () => void fireEvent.submit(form));
    await vi.waitFor(async () => {
      const page = (await getSites())[1]?.profiles[2]?.profile;
      expect(page?.pathPattern).toBe('/top/week');
      expect(page?.feeds[0]?.item.value).toBe(':scope article');
    });
    await screen.findByText('/top/week');
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('checks edits against the saved sample and suggests post links from it', async () => {
    const feed = {
      id: 'fd_x',
      container: { type: 'css' as const, value: 'main > section' },
      item: { type: 'css' as const, value: ':scope > article' },
      exclude: [],
      include: [],
      source: 'manual' as const,
      confidence: 1,
      confirmed: true,
    };
    const profile = { version: 1, hostname: 'social.example', pathPattern: '/home', feeds: [feed] };
    await saveSite({
      id: 'xs',
      hostname: 'social.example',
      label: 'Social',
      enabled: true,
      builtin: false,
      rules: [],
      profiles: [{ view: 'any', profile }],
    });
    const post = (u: string, id: string) =>
      `<article><a href="/${u}"><img alt=""></a><a href="/${u}" role="link">${u}</a>` +
      `<a href="/${u}/status/${id}?s=20&lang=en"><time>3h</time></a><h3>Hello from ${u}</h3></article>`;
    await saveSample({
      siteId: 'xs',
      feedId: 'fd_x',
      url: 'https://social.example/home',
      html: `<html><body><main><section>${post('alice', '1')}${post('bob', '2')}</section></main></body></html>`,
    });

    render(<SitesSettings sub="xs" />);
    await click(await screen.findByLabelText('Edit /home'));
    const form = screen.getByRole('form', { name: 'Edit /home' });
    const status = await within(form).findByRole('status');
    expect(status.textContent).toMatch(/finds 2 of 2 posts/);
    expect(status.textContent).toContain('Hello from alice');
    expect(status.textContent).toContain('https://social.example/alice/status/1?lang=en&s=20');
    const keepS = within(form).getByLabelText('Link selector: keep s') as HTMLInputElement;
    expect(keepS.checked).toBe(true);
    await click(keepS);
    expect(keepS.checked).toBe(false);
    expect(status.querySelector('.font-mono')?.textContent).toBe(
      'https://social.example/alice/status/1?lang=en',
    );
    expect(status.textContent).toMatch(/may show again/);
    await click(keepS);
    expect(status.textContent).not.toMatch(/may show again/);
    await click(within(form).getByLabelText('Link selector: keep lang'));

    const choice = within(form).getByLabelText('Link selector choice') as HTMLSelectElement;
    const input = within(form).getByLabelText('Link selector') as HTMLInputElement;
    expect(choice.value).toBe('auto');
    const labels = [...choice.options].map((o) => o.text);
    expect(labels[0]).toBe('/alice/status/1?lang=en&s=20 · 3h');
    expect(labels).toContain('/alice');
    fireEvent.change(choice, { target: { value: String(labels.indexOf('/alice')) } });
    expect(input.value).not.toBe('');
    expect(status.textContent).toContain('https://social.example/alice');
    expect(status.textContent).not.toContain('status/1');
    expect(within(form).queryByLabelText('Link selector: keep lang')).toBeNull();
    expect(status.textContent).toMatch(/may show again/);

    fireEvent.change(within(form).getByLabelText('Item selector'), {
      target: { value: ':scope > div' },
    });
    expect(status.textContent).toMatch(/Can't verify against the saved sample/);
    await act(async () => void fireEvent.submit(form));
    await vi.waitFor(async () => {
      const f = (await getSites()).find((x) => x.id === 'xs')?.profiles[0]?.profile.feeds[0];
      expect(f?.item.value).toBe(':scope > div');
      expect(f?.permalink?.value).toBe(input.value);
      expect((await getSamples('xs')).map((r) => r.feedId)).toEqual([f?.id]);
    });
  });

  it('edits the post structure and checks it against the sample post', async () => {
    const time = { selector: { type: 'css' as const, value: 'time' }, required: true };
    const feed = {
      id: 'fd_s',
      container: { type: 'css' as const, value: 'main > section' },
      item: { type: 'css' as const, value: ':scope > article' },
      exclude: [],
      include: [],
      source: 'manual' as const,
      confidence: 1,
      confirmed: true,
      structure: { parts: [time] },
    };
    const profile = { version: 1, hostname: 'shape.example', pathPattern: '/', feeds: [feed] };
    await saveSite({
      id: 'sh',
      hostname: 'shape.example',
      label: 'Shape',
      enabled: true,
      builtin: false,
      rules: [],
      profiles: [{ view: 'any', profile }],
    });
    const post = (u: string, id: string) =>
      `<article><a href="/${u}/status/${id}"><time>3h</time></a><h3>Hello from ${u}</h3></article>`;
    await saveSample({
      siteId: 'sh',
      feedId: 'fd_s',
      url: 'https://shape.example/',
      html: `<html><body><main><section><article><a href="https://ads.example/x">Sponsored offer here</a></article>${post('alice', '1')}${post('bob', '2')}${post('carol', '3')}</section></main></body></html>`,
    });

    render(<SitesSettings sub="sh" />);
    await click(await screen.findByLabelText('Edit /'));
    const form = screen.getByRole('form', { name: 'Edit /' });
    const status = await within(form).findByRole('status');
    // The sample post is the first one with the structure, not the ad.
    expect(status.textContent).toContain('Sample post: “Hello from alice”');
    expect(status.textContent).toContain('3 of 4 sample posts have every required part');
    expect(within(form).getByText('in 3 of 4 sample posts')).toBeTruthy();

    const required = within(form).getByLabelText('Part 1 required') as HTMLInputElement;
    await click(required);
    expect(status.textContent).toContain('No part is required, so every item gets the button.');
    await click(required);

    await click(within(form).getByText('Add part'));
    await act(async () => void fireEvent.submit(form));
    expect(within(form).getByRole('alert').textContent).toBe('Part 2 selector is empty.');
    fireEvent.change(within(form).getByLabelText('Part 2 selector'), {
      target: { value: '.nope' },
    });
    expect(status.textContent).toMatch(/No sample post has every required part/);
    await click(within(form).getByLabelText('Remove Part 2'));

    await click(within(form).getByText('Suggest from sample'));
    expect(within(form).getByLabelText('Part 1 selector')).toBeTruthy();
    expect(status.textContent).toContain('3 of 4 sample posts have every required part');
    await act(async () => void fireEvent.submit(form));
    await vi.waitFor(async () => {
      const f = (await getSites()).find((x) => x.id === 'sh')?.profiles[0]?.profile.feeds[0];
      expect(f?.structure?.parts.some((p) => p.required && p.selector.value === 'time')).toBe(true);
    });
  });

  it('says when a feed has no sample yet', async () => {
    await saveSite(custom);
    render(<SitesSettings sub="ex" />);
    await click(await screen.findByLabelText('Edit /latest'));
    const form = screen.getByRole('form', { name: 'Edit /latest' });
    expect(
      await within(form).findAllByText(/No sample of this feed is saved yet/),
    ).not.toHaveLength(0);
    expect(within(form).queryByLabelText('Link selector choice')).toBeNull();
  });

  it('marks built-in pages and restores a page or the whole site', async () => {
    const [site] = await getSites();
    if (!site) throw new Error('no built-in site');
    const top = site.profiles.findIndex((e) => e.profile.pathPattern === '/top/*');
    const topEntry = site.profiles[top];
    if (!topEntry) throw new Error('no /top/*');
    render(<SitesSettings sub="devto" />);
    expect(await screen.findAllByText('built-in')).toHaveLength(site.profiles.length + 1);
    const restoreAll = screen.getByRole('button', { name: /Restore built-in settings/ });
    expect((restoreAll as HTMLButtonElement).disabled).toBe(true);

    const d = pageDraft(topEntry);
    d.pathPattern = '/top/week';
    const own = { ...topEntry, profile: { ...topEntry.profile, pathPattern: '/mine' } };
    const changed = applyPageEdit(site, top, d);
    await act(() => saveSite({ ...changed, profiles: [...changed.profiles, own] }));
    expect(await screen.findByText('edited')).toBeTruthy();
    const restore = screen.getByLabelText('Restore built-in /top/week');
    expect(
      restore.compareDocumentPosition(screen.getByLabelText('Edit /top/week')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    window.confirm = () => true;
    await click(restore);
    await vi.waitFor(() => expect(screen.queryByText('edited')).toBeNull());
    expect((await getSites())[0]?.profiles[top]).toEqual(topEntry);

    await click(restoreAll);
    const dialog = screen.getByRole('dialog', { name: 'Restore built-in settings?' });
    expect(within(dialog).getByText('/mine')).toBeTruthy();
    await click(within(dialog).getByText('Restore, remove my pages'));
    await vi.waitFor(async () => expect((await getSites())[0]?.profiles).toEqual(site.profiles));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a way back for an unknown site', async () => {
    render(<SitesSettings sub="gone" />);
    expect((await screen.findByText('Back to all sites')).getAttribute('href')).toBe('#sites');
  });

  it('imports a sites file and reports errors', async () => {
    render(<SitesSettings />);
    await screen.findByText('DEV Community');
    const input = screen.getByLabelText('Import sites file');
    const bad = new File(['nope'], 's.json', { type: 'application/json' });
    await act(async () => void fireEvent.change(input, { target: { files: [bad] } }));
    await screen.findByText(/not JSON/);
    const good = new File([serializeSites([custom])], 's.json', { type: 'application/json' });
    await act(async () => void fireEvent.change(input, { target: { files: [good] } }));
    await screen.findByText('Example');
  });
});

describe('rules editor', () => {
  it('adds, toggles and deletes auto-ghostify rules', async () => {
    render(<SitesSettings sub="devto" />);
    fireEvent.change(await screen.findByLabelText('New rule'), {
      target: { value: 'crypto hype' },
    });
    await click(screen.getByText('Add rule'));
    await vi.waitFor(async () =>
      expect((await getSites())[0]?.rules[0]).toMatchObject({
        criteria: 'crypto hype',
        enabled: true,
      }),
    );
    await click(await screen.findByRole('switch', { name: 'Enable rule crypto hype' }));
    await vi.waitFor(async () => expect((await getSites())[0]?.rules[0]?.enabled).toBe(false));
    await click(screen.getByLabelText('Delete rule crypto hype'));
    await vi.waitFor(async () => expect((await getSites())[0]?.rules).toEqual([]));
  });
});
