import { initQueue } from '@/src/background/ai-queue';
import { registerHandlers } from '@/src/background/handlers';
import { initIndexer } from '@/src/background/indexer';
import { initSnooze } from '@/src/background/snooze';
import { syncRegistrations } from '@/src/sites/registration';
import { ensureDefaultSites, getSites, sitesItem } from '@/src/sites/registry';

export default defineBackground(() => {
  void initQueue();
  registerHandlers();
  void initSnooze();
  void initIndexer();

  const sync = () => void getSites().then(syncRegistrations).catch(console.warn);
  const init = () => void ensureDefaultSites().then(sync);
  browser.runtime.onInstalled.addListener(init);
  browser.runtime.onStartup.addListener(init);
  sitesItem.watch(sync);
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);
});
