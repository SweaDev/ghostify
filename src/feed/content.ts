import { createLlmProxy } from 'feedgrab';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { sendMessage } from '../messaging';
import { hostMatches } from '../sites/model';
import { getSites, sitesItem } from '../sites/registry';
import { getSettings, watchSettings } from '../store/settings';
import { messagingApi } from './api';
import { type FeedRuntime, startFeedRuntime } from './runtime';

/** feedgrab LLM calls go to the background, which holds the models and keys. */
const llm = createLlmProxy(async (req) => {
  const reply = await sendMessage('llm', { req });
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.res;
});

/** Shared content-script body: (re)starts the runtime on load, SPA navigation and site edits. */
export async function runFeedContent(ctx: ContentScriptContext): Promise<void> {
  let runtime: FeedRuntime | undefined;
  let sig = '';
  let seq = 0;
  /** Restarts on navigation and view changes; storage changes only when they affect this page. */
  const restart = async (force = true) => {
    const n = ++seq;
    const [sites, settings] = await Promise.all([getSites(), getSettings()]);
    const site = sites.find((s) => hostMatches(s.hostname, location.hostname));
    const next = JSON.stringify([site, settings.ai.enabled]);
    if (n !== seq || ctx.isInvalid || (!force && next === sig)) return;
    sig = next;
    runtime?.dispose();
    runtime = startFeedRuntime({
      doc: document,
      url: location.href,
      sites,
      api: messagingApi,
      onViewChange: () => void restart(),
      llm: settings.ai.enabled ? llm : undefined,
    });
  };
  ctx.addEventListener(window, 'wxt:locationchange', () => void restart());
  ctx.onInvalidated(sitesItem.watch(() => void restart(false)));
  ctx.onInvalidated(watchSettings(() => void restart(false)));
  ctx.onInvalidated(() => runtime?.dispose());
  await restart();
}
