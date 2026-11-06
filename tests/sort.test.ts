import type { GhostItem } from '@/src/store/db';
import { relevance, sortItems } from '@/src/ui/sort';

const item = (key: string, createdAt: number, extra: Partial<GhostItem> = {}): GhostItem => ({
  key,
  id: key,
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut',
  title: '',
  excerpt: '',
  state: 'ghost',
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

const keys = (items: GhostItem[]) => items.map((i) => i.key);
const a = item('a', 1, { title: 'Rust tips', excerpt: 'web' });
const b = item('b', 2, { title: 'Web news', excerpt: 'rust and web' });
const c = item('c', 3, { title: 'Cooking', excerpt: 'rust stains' });
const all = [c, b, a];

describe('sortItems', () => {
  it('sorts by date both ways', () => {
    expect(keys(sortItems([a, c, b], { by: 'date', order: 'desc', seed: 0 }))).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(keys(sortItems(all, { by: 'date', order: 'asc', seed: 0 }))).toEqual(['a', 'b', 'c']);
  });

  it('ranks keyword relevance, title first, ties by date', () => {
    const s = { by: 'relevance' as const, order: 'desc' as const, seed: 0 };
    expect(keys(sortItems(all, s, { text: 'rust' }))).toEqual(['a', 'c', 'b']);
    expect(keys(sortItems(all, { ...s, order: 'asc' }, { text: 'rust' }))).toEqual(['b', 'c', 'a']);
    expect(relevance(b, 'rust web')).toBeGreaterThan(relevance(a, 'rust web'));
  });

  it('falls back to date without a search', () => {
    expect(keys(sortItems([a, c, b], { by: 'relevance', order: 'desc', seed: 0 }))).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('keeps ranked (semantic) order as relevance', () => {
    const s = { by: 'relevance' as const, order: 'asc' as const, seed: 0 };
    expect(keys(sortItems([b, a, c], s, { text: 'x', ranked: true }))).toEqual(['c', 'a', 'b']);
  });

  it('shuffles stably per seed', () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`k${i}`, i));
    const s = { by: 'date' as const, order: 'random' as const, seed: 7 };
    const once = keys(sortItems(many, s));
    expect(keys(sortItems([...many].reverse(), s))).toEqual(once);
    expect(once).not.toEqual(keys(sortItems(many, { ...s, seed: 8 })));
    expect([...once].sort()).toEqual(keys(many).sort());
  });
});
