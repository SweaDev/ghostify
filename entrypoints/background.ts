import { registerHandlers } from '@/src/background/handlers';
import { initSnooze } from '@/src/background/snooze';
import { ensureDefaultSites } from '@/src/sites/registry';

export default defineBackground(() => {
  registerHandlers();
  void initSnooze();
  browser.runtime.onInstalled.addListener(() => void ensureDefaultSites());
  browser.runtime.onStartup.addListener(() => void ensureDefaultSites());
});
