import { createLlmProxy } from 'feedgrab';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { sendMessage } from '../messaging';
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
  const restart = async () => {
    runtime?.dispose();
    if (ctx.isInvalid) return;
    runtime = startFeedRuntime({
      doc: document,
      url: location.href,
      sites: await getSites(),
      api: messagingApi,
      onViewChange: () => void restart(),
      llm: (await getSettings()).ai.enabled ? llm : undefined,
    });
  };
  ctx.addEventListener(window, 'wxt:locationchange', () => void restart());
  ctx.onInvalidated(sitesItem.watch(() => void restart()));
  ctx.onInvalidated(watchSettings(() => void restart()));
  ctx.onInvalidated(() => runtime?.dispose());
  await restart();
}
