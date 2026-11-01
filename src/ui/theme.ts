import { getSettings, watchSettings } from '../store/settings';

type Theme = 'system' | 'light' | 'dark';

function apply(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Keeps `<html data-theme>` in sync with the theme setting and the OS preference. */
export async function initTheme(): Promise<void> {
  let theme = (await getSettings()).ui.theme;
  apply(theme);
  watchSettings((s) => {
    theme = s.ui.theme;
    apply(theme);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(theme));
}
