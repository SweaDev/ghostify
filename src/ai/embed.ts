import { type EmbeddingModel, embed } from 'ai';
import type { Embedding, GhostItem } from '../store/db';
import type { ModelRef } from '../store/settings';
import { itemText } from './enrich';

/** Stored embeddings are tied to the model that made them. */
export const modelTag = (ref: ModelRef) => `${ref.provider}:${ref.model}`;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export const embedText = (item: GhostItem) =>
  [itemText(item), item.summary, item.tags?.map((t) => `#${t}`).join(' ')]
    .filter(Boolean)
    .join('\n');

export async function embedItem(
  item: GhostItem,
  model: EmbeddingModel,
  tag: string,
): Promise<Embedding> {
  const { embedding } = await embed({ model, value: embedText(item) });
  return { key: item.key, model: tag, dim: embedding.length, vector: embedding };
}

export const MIN_SCORE = 0.2;

/** Keys ranked by similarity to `query` (best first), ignoring other models' and weak matches. */
export function rank(query: number[], embeddings: Embedding[], tag: string, limit = 50): string[] {
  return embeddings
    .filter((e) => e.model === tag && e.dim === query.length)
    .map((e) => ({ key: e.key, score: cosine(query, e.vector) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.key);
}
