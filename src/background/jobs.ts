import { embed } from 'ai';
import { embedItem, modelTag, rank } from '../ai/embed';
import { enrichItem } from '../ai/enrich';
import { embeddingModel, languageModel } from '../ai/models';
import { db, type GhostItem } from '../store/db';
import { getItem, type ListQuery, listItems, updateItem } from '../store/items';
import { getKeys } from '../store/secrets';
import { getSettings } from '../store/settings';

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;

/** Runs AI jobs one at a time, so a local model is never flooded. Rejects with the task's error. */
export function runJob<T>(task: () => Promise<T>): Promise<T> {
  pending++;
  const result = chain.then(task);
  chain = result.catch(() => {}).finally(() => pending--);
  return result;
}

/** Like `runJob`, but errors are logged instead of thrown. */
export const enqueue = (task: () => Promise<void>): Promise<void> =>
  runJob(task).catch((e) => console.warn('[ghostify:ai]', e));

/** Resolves once no AI job is queued or running. */
export async function whenIdle(): Promise<void> {
  while (pending > 0) await chain;
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

export async function embedKey(key: string): Promise<void> {
  const [settings, keys, item] = await Promise.all([getSettings(), getKeys(), getItem(key)]);
  if (!settings.ai.enabled || !item) return;
  const ref = settings.ai.embedding;
  await db.embeddings.put(
    await embedItem(item, embeddingModel(ref, settings, keys), modelTag(ref)),
  );
}

/** AI work after an item is ghostified (no-op while AI is off). */
export function afterGhostify(key: string): Promise<void> {
  return enqueue(async () => {
    await enrich(key).catch((e) => console.warn('[ghostify:ai] enrich', e));
    await embedKey(key);
  });
}

export interface SearchResult {
  items: GhostItem[];
  /** True when semantic search was not possible and keyword search was used. */
  fallback: boolean;
}

/** Semantic search within the filters; falls back to keyword search when AI fails or is off. */
export async function searchSemantic(query: string, filters: ListQuery): Promise<SearchResult> {
  const keyword = async () => ({
    items: await listItems({ ...filters, text: query }),
    fallback: true,
  });
  const [settings, keys] = await Promise.all([getSettings(), getKeys()]);
  if (!settings.ai.enabled || !query.trim()) return keyword();
  try {
    const ref = settings.ai.embedding;
    const { embedding } = await embed({ model: embeddingModel(ref, settings, keys), value: query });
    const ranked = rank(embedding, await db.embeddings.toArray(), modelTag(ref));
    const pool = new Map((await listItems({ ...filters, text: undefined })).map((i) => [i.key, i]));
    const items = ranked.map((k) => pool.get(k)).filter((i): i is GhostItem => !!i);
    return { items, fallback: false };
  } catch (e) {
    console.warn('[ghostify:ai] search', e);
    return keyword();
  }
}
