import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sitesItem } from '@/src/sites/registry';
import { DEFAULT_SETTINGS, getSettings, placementFor, withDefaults } from '@/src/store/settings';
import { AppearanceSettings } from '@/src/ui/AppearanceSettings';
import { GeneralSettings } from '@/src/ui/GeneralSettings';

afterEach(cleanup);

describe('appearance settings', () => {
  it('fills missing ghost button fields with defaults', () => {
    const s = withDefaults({
      ui: { theme: 'dark', ghostButton: { corner: 'bottom-left' } } as never,
    });
    expect(s.ui).toEqual({
      theme: 'dark',
      ghostButton: { ...DEFAULT_SETTINGS.ui.ghostButton, corner: 'bottom-left' },
      siteGhostButtons: {},
      sort: DEFAULT_SETTINGS.ui.sort,
    });
  });

  it('uses a site override over the global placement', () => {
    const own = { corner: 'bottom-left', vertical: 4, horizontal: 12 } as const;
    const s = withDefaults({ ui: { siteGhostButtons: { devto: own } } as never });
    expect(placementFor(s, 'devto')).toEqual(own);
    expect(placementFor(s, 'other')).toEqual(DEFAULT_SETTINGS.ui.ghostButton);
    expect(placementFor(s)).toEqual(DEFAULT_SETTINGS.ui.ghostButton);
  });

  it('gives a site its own placement and removes it again', async () => {
    await sitesItem.setValue([
      {
        id: 'devto',
        hostname: 'dev.to',
        label: 'DEV',
        enabled: true,
        builtin: false,
        profiles: [],
        rules: [],
      },
    ]);
    render(<AppearanceSettings />);
    const scope = await screen.findByLabelText('Applies to');
    await vi.waitFor(() => expect(screen.getByRole('option', { name: 'DEV' })).toBeTruthy());
    fireEvent.change(scope, { target: { value: 'devto' } });
    const own = screen.getByRole('switch', { name: 'Own position on DEV' });
    // The editor is locked while the site follows the global placement.
    const editor = () => screen.getByLabelText('From top').closest('fieldset');
    expect(editor()?.disabled).toBe(true);
    await act(async () => void fireEvent.click(own));
    await vi.waitFor(async () =>
      expect((await getSettings()).ui.siteGhostButtons.devto).toEqual(
        DEFAULT_SETTINGS.ui.ghostButton,
      ),
    );
    expect(editor()?.disabled).toBe(false);
    await act(async () => void fireEvent.click(screen.getByLabelText('Bottom left')));
    await vi.waitFor(async () => {
      const { ui } = await getSettings();
      expect(ui.siteGhostButtons.devto?.corner).toBe('bottom-left');
      expect(ui.ghostButton).toEqual(DEFAULT_SETTINGS.ui.ghostButton);
    });
    expect(screen.getByRole('option', { name: 'DEV (own position)' })).toBeTruthy();
    await act(async () => void fireEvent.click(own));
    await vi.waitFor(async () => expect((await getSettings()).ui.siteGhostButtons).toEqual({}));
  });

  it('saves the corner and margins, clamped, and resets them', async () => {
    render(<AppearanceSettings />);
    const corner = await screen.findByLabelText('Bottom left');
    await act(async () => void fireEvent.click(corner));
    await vi.waitFor(async () =>
      expect((await getSettings()).ui.ghostButton.corner).toBe('bottom-left'),
    );
    // Labels follow the corner.
    fireEvent.change(screen.getByLabelText('From bottom'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('From left'), { target: { value: '999' } });
    await vi.waitFor(async () =>
      expect((await getSettings()).ui.ghostButton).toEqual({
        corner: 'bottom-left',
        vertical: 24,
        horizontal: 200,
      }),
    );
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /reset/i })));
    await vi.waitFor(async () =>
      expect((await getSettings()).ui.ghostButton).toEqual(DEFAULT_SETTINGS.ui.ghostButton),
    );
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('keeps the button placement when the theme changes', async () => {
    render(<AppearanceSettings />);
    const corner = await screen.findByLabelText('Top left');
    await act(async () => void fireEvent.click(corner));
    fireEvent.change(screen.getByRole('combobox', { name: /theme/i }), {
      target: { value: 'dark' },
    });
    await vi.waitFor(async () =>
      expect((await getSettings()).ui).toMatchObject({
        theme: 'dark',
        ghostButton: { corner: 'top-left' },
      }),
    );
  });
});

describe('about', () => {
  it('shows the version, author and repository', () => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '9.8.7' } as never);
    render(<GeneralSettings />);
    expect(screen.getByText('Version 9.8.7')).toBeTruthy();
    expect(screen.getByText('Fayaz Ahmed')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'github.com/SweaDev/ghostify' }).getAttribute('href'),
    ).toBe('https://github.com/SweaDev/ghostify');
  });
});
