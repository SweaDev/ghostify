import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { applyPageEdit, pageDraft } from '@/src/sites/edit';
import { mergeSites, parseSitesJson, serializeSites } from '@/src/sites/io';
import { getSites, saveSite } from '@/src/sites/registry';
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

  it('round-trips and validates item links', () => {
    const id = custom.profiles[0]?.profile.feeds[0]?.id ?? '';
    const option = {
      selector: { type: 'css' as const, value: 'a:has(time)' },
      url: 'https://e.x/p/1',
      text: '3h',
    };
    const links = {
      [id]: { selector: { type: 'css' as const, value: 'a:has(time)' }, options: [option] },
    };
    const [first] = custom.profiles;
    if (!first) throw new Error('no page');
    const site = { ...custom, profiles: custom.profiles.with(0, { ...first, links }) };
    expect(parseSitesJson(serializeSites([site]))[0]?.profiles[0]?.links).toEqual(links);
    const bad = (l: unknown) => () =>
      parseSitesJson(JSON.stringify([{ ...site, profiles: [{ ...site.profiles[0], links: l }] }]));
    expect(bad({ [id]: { selector: { type: 'regex', value: 'a' } } })).toThrow(/selector/);
    expect(bad({ [id]: { ...links[id], options: [{ ...option, url: 'javascript:x' }] } })).toThrow(
      /http/,
    );
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

  it('picks a post link from the saved choices or by selector', async () => {
    const id = custom.profiles[2]?.profile.feeds[0]?.id ?? '';
    const options = [
      {
        selector: { type: 'css' as const, value: 'a.author' },
        url: 'https://example.com/al',
        text: 'Al',
      },
      {
        selector: { type: 'css' as const, value: 'h2 a' },
        url: 'https://example.com/al/post',
        text: 'Post',
      },
    ];
    const entry = custom.profiles[2];
    if (!entry) throw new Error('no page');
    await saveSite({
      ...custom,
      profiles: custom.profiles.with(2, {
        ...entry,
        links: { [id]: { selector: { type: 'css', value: 'h2 a' }, options } },
      }),
    });
    render(<SitesSettings sub="ex" />);
    await screen.findByText(/→ link: h2 a/);
    await click(screen.getByLabelText('Edit /top/*'));
    const form = screen.getByRole('form', { name: 'Edit /top/*' });
    const choice = within(form).getAllByLabelText(/link selector choice$/i)[0] as HTMLSelectElement;
    const input = within(form).getAllByLabelText(/1 link selector$/i)[0] as HTMLInputElement;
    expect(choice.value).toBe('1');
    expect([...choice.options].map((o) => o.text)).toContain('/al/post · Post');
    fireEvent.change(choice, { target: { value: '0' } });
    expect(input.value).toBe('a.author');
    fireEvent.change(input, { target: { value: 'a.title' } });
    expect(choice.value).toBe('custom');
    await act(async () => void fireEvent.submit(form));
    await vi.waitFor(async () => {
      const page = (await getSites()).find((s) => s.id === 'ex')?.profiles[2];
      expect(page?.links?.[id]).toEqual({ selector: { type: 'css', value: 'a.title' }, options });
    });
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
