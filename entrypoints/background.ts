import { registerHandlers } from '@/src/background/handlers';
import { initSnooze } from '@/src/background/snooze';
import { syncRegistrations } from '@/src/sites/registration';
import { ensureDefaultSites, getSites, sitesItem } from '@/src/sites/registry';

export default defineBackground(() => {
  registerHandlers();
  void initSnooze();

  const sync = () => void getSites().then(syncRegistrations).catch(console.warn);
  const init = () => void ensureDefaultSites().then(sync);
  browser.runtime.onInstalled.addListener(init);
  browser.runtime.onStartup.addListener(init);
  sitesItem.watch(sync);
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);
});
