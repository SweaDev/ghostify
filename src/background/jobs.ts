import { enrichItem } from '../ai/enrich';
import { languageModel } from '../ai/models';
import { getItem, updateItem } from '../store/items';
import { getKeys } from '../store/secrets';
import { getSettings } from '../store/settings';

let chain: Promise<unknown> = Promise.resolve();

/** Runs AI jobs one at a time, so a local model is never flooded. Errors are logged. */
export function enqueue(task: () => Promise<void>): Promise<void> {
  const next = chain.then(task).catch((e) => console.warn('[ghostify:ai]', e));
  chain = next;
  return next;
}

export async function enrich(key: string, force = false): Promise<void> {
  const [settings, keys, item] = await Promise.all([getSettings(), getKeys(), getItem(key)]);
  if (!settings.ai.enabled || !item || (item.summary && !force)) return;
  const { summary, tags } = await enrichItem(
    item,
    languageModel(settings.ai.general, settings, keys),
  );
  await updateItem(key, { summary, tags });
}

/** AI work after an item is ghostified (no-op while AI is off). */
export function afterGhostify(key: string): Promise<void> {
  return enqueue(() => enrich(key));
}
