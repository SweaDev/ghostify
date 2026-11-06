import type { GhostItem } from '../store/db';
import type { Sort } from '../store/settings';

const FIELDS: [weight: number, get: (i: GhostItem) => string | undefined][] = [
  [3, (i) => i.title],
  [2, (i) => i.tags?.join(' ')],
  [2, (i) => i.author],
  [1, (i) => i.summary],
  [1, (i) => i.excerpt],
];

/** Keyword relevance: each word scores by the fields it appears in (title highest), plus the whole phrase. */
export function relevance(item: GhostItem, text: string): number {
  const fields = FIELDS.map(([w, get]) => [w, (get(item) ?? '').toLowerCase()] as const);
  const phrase = text.trim().toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const [w, hay] of fields) {
    for (const word of words) if (hay.includes(word)) score += w;
    if (words.length > 1 && hay.includes(phrase)) score += w * 2;
  }
  return score;
}

/** Deterministic pseudo-random rank of a key for a seed (FNV-1a). */
function shuffleRank(key: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Orders items. Relevance needs a search: without one it sorts by date. With `ranked`
 * (semantic results), the given order is the relevance order.
 */
export function sortItems(
  items: GhostItem[],
  sort: Sort,
  opts: { text?: string; ranked?: boolean } = {},
): GhostItem[] {
  if (sort.order === 'random') {
    return items
      .map((i) => [shuffleRank(i.key, sort.seed), i] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, i]) => i);
  }
  const text = opts.text?.trim();
  const byDate = (a: GhostItem, b: GhostItem) => b.createdAt - a.createdAt;
  let desc: GhostItem[];
  if (sort.by === 'relevance' && text && opts.ranked) desc = [...items];
  else if (sort.by === 'relevance' && text) {
    const score = new Map(items.map((i) => [i.key, relevance(i, text)]));
    desc = [...items].sort(
      (a, b) => (score.get(b.key) ?? 0) - (score.get(a.key) ?? 0) || byDate(a, b),
    );
  } else desc = [...items].sort(byDate);
  return sort.order === 'asc' ? desc.reverse() : desc;
}
