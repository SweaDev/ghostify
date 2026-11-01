import { browser } from 'wxt/browser';
import { isReady } from '../ai/browser/provider';
import { modelTag } from '../ai/embed';
import { db } from '../store/db';
import { indexStatus, missingKeys } from '../store/index-status';
import { getSettings, watchSettings } from '../store/settings';
import { JobStopped } from './ai-queue';
import { embedKey, whenIdle } from './jobs';

export const INDEX_ALARM = 'index-backfill';

let current: Promise<void> | undefined;

/**
 * Embeds items that lack an embedding for the current model, one at a time and only while no
 * other AI job is waiting. Single-flight; safe to call often.
 */
export function backfill(): Promise<void> {
  current ??= run().finally(() => {
    current = undefined;
  });
  return current;
}

async function run(): Promise<void> {
  let tag: string | undefined;
  let backlog: string[] = [];
  const tried = new Set<string>();
  try {
    // Settings are re-read every item (model changes are picked up, and the storage calls keep
    // the MV3 service worker awake). The backlog is listed once, and again when it runs out, so
    // items ghosted meanwhile are included; each key is tried once per run.
    for (;;) {
      const settings = await getSettings();
      if (!settings.ai.enabled) break;
      if (!(await isReady(settings, 'embedding'))) {
        await indexStatus.setValue({
          running: false,
          error: 'Download the embedding model in Settings → AI',
        });
        return;
      }
      const t = modelTag(settings.ai.embedding);
      if (t !== tag || !backlog.length) {
        if (t !== tag) tried.clear();
        backlog = (await missingKeys(t)).filter((k) => !tried.has(k));
        if (!backlog.length) break;
        if (t !== tag) {
          tag = t;
          const total = await db.items.count();
          await indexStatus.setValue({
            running: true,
            startedAt: Date.now(),
            startIndexed: total - backlog.length,
          });
        }
      }
      const next = backlog.shift() as string;
      tried.add(next);
      await whenIdle();
      await embedKey(next);
    }
    await indexStatus.setValue({ running: false });
  } catch (e) {
    // Stopped from the AI activity log: wait for the next alarm instead of asking again.
    if (e instanceof JobStopped) return void (await indexStatus.setValue({ running: false }));
    console.warn('[ghostify:ai] index', e);
    await indexStatus.setValue({ running: false, error: (e as Error).message });
  }
}

/** Starts a backfill now and returns how many items it has to embed. */
export async function reindex(): Promise<number> {
  const settings = await getSettings();
  if (!settings.ai.enabled) return 0;
  const n = (await missingKeys(modelTag(settings.ai.embedding))).length;
  void backfill();
  return n;
}

/** Backfills on wake-up, on settings changes and every few minutes (retries after errors). */
export async function initIndexer(): Promise<void> {
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === INDEX_ALARM) void backfill();
  });
  watchSettings(() => void backfill());
  if (!(await browser.alarms.get(INDEX_ALARM))) {
    await browser.alarms.create(INDEX_ALARM, { periodInMinutes: 5, delayInMinutes: 1 });
  }
  void backfill();
}
