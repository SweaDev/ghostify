import { embed } from 'ai';
import { embedItem, modelTag, rank } from '../ai/embed';
import { enrichItem } from '../ai/enrich';
import { embeddingModel, languageModel } from '../ai/models';
import { db, type GhostItem } from '../store/db';
import { getItem, type ListQuery, listItems, updateItem } from '../store/items';
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

/** Embeds every item that has no embedding from the current model. Returns how many were queued. */
export async function reindex(): Promise<number> {
  const settings = await getSettings();
  if (!settings.ai.enabled) return 0;
  const tag = modelTag(settings.ai.embedding);
  const have = new Set(
    (await db.embeddings.toArray()).filter((e) => e.model === tag).map((e) => e.key),
  );
  const todo = (await db.items.toCollection().primaryKeys()).filter((k) => !have.has(k));
  for (const key of todo) void enqueue(() => embedKey(key));
  return todo.length;
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
