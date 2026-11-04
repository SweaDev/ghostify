import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEVTO_SITE } from '@/src/sites/defaults';
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
  it('toggles, edits the login indicator, lists profiles and deletes custom sites', async () => {
    await saveSite(custom);
    render(<SitesSettings />);
    await screen.findByText('Example');
    await click(screen.getByRole('switch', { name: 'Enable DEV Community' }));
    await vi.waitFor(async () => expect((await getSites())[0]?.enabled).toBe(false));

    await click(screen.getByText('Example'));
    const sel = screen.getByLabelText('Login indicator selector');
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

    expect(screen.queryByLabelText('Delete DEV Community')).toBeNull();
    window.confirm = () => true;
    await click(screen.getByLabelText('Delete Example'));
    await vi.waitFor(async () => expect((await getSites()).map((s) => s.id)).toEqual(['devto']));
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
    render(<SitesSettings />);
    await click(await screen.findByText('DEV Community'));
    fireEvent.change(screen.getByLabelText('New rule'), { target: { value: 'crypto hype' } });
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
