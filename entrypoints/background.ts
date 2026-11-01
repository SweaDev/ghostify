import { registerHandlers } from '@/src/background/handlers';
import { ensureDefaultSites } from '@/src/sites/registry';

export default defineBackground(() => {
  registerHandlers();
  browser.runtime.onInstalled.addListener(() => void ensureDefaultSites());
  browser.runtime.onStartup.addListener(() => void ensureDefaultSites());
});
