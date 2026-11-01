import { browser } from 'wxt/browser';

export type Target = 'tab' | 'window';

export function openUrl(url: string, target: Target): void {
  if (target === 'window')
    void browser.windows.create({ url, focused: true, width: 1100, height: 900 });
  else void browser.tabs.create({ url });
}

/** The Ghostify viewer for one item, as its own page. */
export const viewerUrl = (key: string, tab?: string) =>
  `${browser.runtime.getURL('/dashboard.html')}#item=${encodeURIComponent(key)}${tab ? `&tab=${tab}` : ''}`;

/** `#item=…&tab=…` of a viewer page. */
export function viewerHash(hash = location.hash): { key?: string; tab?: string } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return { key: p.get('item') ?? undefined, tab: p.get('tab') ?? undefined };
}
