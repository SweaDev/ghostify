import { browser } from 'wxt/browser';
import type { ProtocolMap } from '../messaging';
import { onMessage } from '../messaging';
import { ghostedIds, ghostify, listItems, setState, unghost } from '../store/items';

type Handlers = {
  [K in keyof ProtocolMap]: (
    data: Parameters<ProtocolMap[K]>[0],
  ) => ReturnType<ProtocolMap[K]> | Promise<ReturnType<ProtocolMap[K]>>;
};

export const handlers: Handlers = {
  isGhosted: ({ host, ids }) => ghostedIds(host, ids),
  ghostify: (draft) => ghostify(draft),
  unghost: ({ key }) => unghost(key),
  setState: ({ key, state, snoozeUntil }) => setState(key, state, snoozeUntil),
  listItems: (q) => listItems(q),
  openDashboard: async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  },
  addSite: async ({ tabId }) => {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/picker.js'],
    });
  },
};

export function registerHandlers(): void {
  for (const type of Object.keys(handlers) as (keyof ProtocolMap)[]) {
    // biome-ignore lint/suspicious/noExplicitAny: handler/data types are tied by the map above
    const handler = handlers[type] as (data: any) => unknown;
    onMessage(type, ({ data }) => handler(data) as never);
  }
}
