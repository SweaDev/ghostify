import { db, type GhostDraft } from '@/src/store/db';
import {
  countByState,
  expireSnoozes,
  ghostedIds,
  ghostify,
  listItems,
  setState,
  unghost,
} from '@/src/store/items';

const draft = (id: string, extra: Partial<GhostDraft> = {}): GhostDraft => ({
  id,
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut',
  title: `Post ${id}`,
  excerpt: `Excerpt for ${id}`,
  ...extra,
});

beforeEach(async () => {
  await db.items.clear();
  await db.embeddings.clear();
});

describe('items repository', () => {
  it('ghostifies idempotently by key', async () => {
    const a = await ghostify(draft('a'), 1);
    const again = await ghostify(draft('a', { title: 'changed' }), 2);
    expect(again).toEqual(a);
    expect(a).toMatchObject({ key: 'dev.to:a', state: 'ghost', createdAt: 1 });
  });

  it('unghosts and reports ghosted ids', async () => {
    await ghostify(draft('a'));
    await ghostify(draft('b'));
    expect(await ghostedIds('dev.to', ['a', 'b', 'c'])).toEqual(['a', 'b']);
    await unghost('dev.to:a');
    expect(await ghostedIds('dev.to', ['a', 'b'])).toEqual(['b']);
    expect(await ghostedIds('other.test', ['b'])).toEqual([]);
  });

  it('moves between states and validates snooze', async () => {
    await ghostify(draft('a'));
    expect((await setState('dev.to:a', 'later')).state).toBe('later');
    await expect(setState('dev.to:a', 'snoozed', 5, 10)).rejects.toThrow();
    const s = await setState('dev.to:a', 'snoozed', 100, 10);
    expect(s).toMatchObject({ state: 'snoozed', snoozeUntil: 100 });
    expect((await setState('dev.to:a', 'ghost')).snoozeUntil).toBeUndefined();
    await expect(setState('dev.to:x', 'later')).rejects.toThrow();
  });

  it('expires snoozes into the ghost state with returnedAt', async () => {
    await ghostify(draft('a'));
    await ghostify(draft('b'));
    await setState('dev.to:a', 'snoozed', 100, 10);
    await setState('dev.to:b', 'snoozed', 300, 10);
    expect(await expireSnoozes(200)).toBe(1);
    const [a, b] = await db.items.bulkGet(['dev.to:a', 'dev.to:b']);
    expect(a).toMatchObject({ state: 'ghost', returnedAt: 200 });
    expect(a?.snoozeUntil).toBeUndefined();
    expect(b?.state).toBe('snoozed');
    expect(await countByState()).toEqual({ ghost: 1, later: 0, snoozed: 1 });
  });

  it('lists newest first with filters', async () => {
    await ghostify(draft('a', { author: 'Ada' }), 1);
    await ghostify(draft('b', { host: 'x.test' }), 2);
    await ghostify(draft('c'), 3);
    await setState('dev.to:c', 'later');
    expect((await listItems()).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect((await listItems({ state: 'ghost' })).map((i) => i.id)).toEqual(['b', 'a']);
    expect((await listItems({ host: 'dev.to' })).map((i) => i.id)).toEqual(['c', 'a']);
    expect((await listItems({ text: 'ada post' })).map((i) => i.id)).toEqual(['a']);
    expect((await listItems({ limit: 1 })).map((i) => i.id)).toEqual(['c']);
  });
});

describe('listHosts', () => {
  it('returns distinct sorted hosts', async () => {
    const { listHosts } = await import('@/src/store/items');
    await ghostify(draft('a', { host: 'x.test' }));
    await ghostify(draft('b'));
    await ghostify(draft('c'));
    expect(await listHosts()).toEqual(['dev.to', 'x.test']);
  });
});
