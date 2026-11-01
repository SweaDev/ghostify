import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { getSites, sitesItem } from '../sites/registry';
import { messagingApi } from './api';
import { type FeedRuntime, startFeedRuntime } from './runtime';

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
    });
  };
  ctx.addEventListener(window, 'wxt:locationchange', () => void restart());
  ctx.onInvalidated(sitesItem.watch(() => void restart()));
  ctx.onInvalidated(() => runtime?.dispose());
  await restart();
}
