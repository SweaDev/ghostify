import { captureSample, type SiteProfile, type UnifiedFeed } from 'feedgrab';
import type { RuntimeApi } from './api';

/**
 * feedgrab sample budget; Settings checks edited selectors against it. With a structure, feedgrab
 * includes the post most like the chosen sample post.
 */
export const SAMPLE_OPTIONS = { items: 4, maxBytes: 20000 };
/** Without a second item by then, a one-item sample is saved. */
const SETTLE_MS = 5000;

/**
 * Saves a sample of each feed that has none (or an old one) once it shows two items, so
 * selectors can be checked in Settings. Returns a dispose function.
 */
export function watchSamples(opts: {
  doc: Document;
  url: string;
  siteId: string;
  profile: SiteProfile;
  feed: UnifiedFeed;
  api: RuntimeApi;
  warn(e: unknown): void;
}): () => void {
  const { doc, url, siteId, profile, feed, api, warn } = opts;
  if (!api.samplesNeeded || !api.saveSample) return () => {};
  const save = api.saveSample;
  const counts = new Map<string, number>();
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;

  const stop = () => {
    done = true;
    clearTimeout(timer);
    off();
  };
  const capture = (force: boolean) => {
    for (const id of pending) {
      const n = counts.get(id) ?? 0;
      const d = profile.feeds.find((f) => f.id === id);
      if (!d || n < (force ? 1 : 2)) continue;
      pending.delete(id);
      const html = captureSample(doc, d, SAMPLE_OPTIONS);
      if (html) save(siteId, id, url, html).catch(warn);
    }
    if (force || !pending.size) stop();
  };
  const off = feed.on('item:added', (item) => {
    counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1);
    if (pending.has(item.feedId)) capture(false);
  });
  for (const item of feed.items()) counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1);

  api
    .samplesNeeded(
      siteId,
      profile.feeds.map((f) => f.id),
      url,
    )
    .then((ids) => {
      if (done) return;
      pending = new Set(ids);
      if (!pending.size) return stop();
      capture(false);
      if (!done) timer = setTimeout(() => capture(true), SETTLE_MS);
    })
    .catch((e) => {
      stop();
      warn(e);
    });
  return stop;
}
