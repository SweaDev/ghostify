import { browser } from 'wxt/browser';
import { checkPurpose } from '../ai/check';
import type { ProtocolMap } from '../messaging';
import { onMessage } from '../messaging';
import { ghostedIds, ghostify, listItems, setState, unghost } from '../store/items';
import { afterGhostify, embedKey, enqueue, enrich, reindex, searchSemantic } from './jobs';

type Handlers = {
  [K in keyof ProtocolMap]: (
    data: Parameters<ProtocolMap[K]>[0],
  ) => ReturnType<ProtocolMap[K]> | Promise<ReturnType<ProtocolMap[K]>>;
};

export const handlers: Handlers = {
  isGhosted: ({ host, ids }) => ghostedIds(host, ids),
  ghostify: async (draft) => {
    const item = await ghostify(draft);
    void afterGhostify(item.key);
    return item;
  },
  unghost: ({ key }) => unghost(key),
  setState: ({ key, state, snoozeUntil }) => setState(key, state, snoozeUntil),
  listItems: (q) => listItems(q),
  openDashboard: async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  },
  checkAi: ({ purpose }) => checkPurpose(purpose),
  enrich: ({ key }) =>
    enqueue(async () => {
      await enrich(key, true);
      await embedKey(key);
    }),
  searchSemantic: ({ query, filters }) => searchSemantic(query, filters),
  reindex: () => reindex(),
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
