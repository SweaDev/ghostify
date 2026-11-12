import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { permalinkId } from 'feedgrab';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEVTO_SITE } from '@/src/sites/defaults';
import type { Site } from '@/src/sites/model';
import { saveSite } from '@/src/sites/registry';
import { db, type GhostItem } from '@/src/store/db';
import { applyRekey, mergeItems, planRekey } from '@/src/store/rekey';
import { deleteSnapshot, listSnapshots } from '@/src/store/snapshots';
import { RekeyBanner } from '@/src/ui/RekeyBanner';

const HOST = 'www.video.example';
const feed = (id: string, permalinkParams?: string[]) => ({
  id,
  container: { type: 'css' as const, value: 'main' },
  item: { type: 'css' as const, value: ':scope > article' },
  exclude: [],
  include: [],
  source: 'manual' as const,
  confidence: 1,
  confirmed: true,
  ...(permalinkParams && { permalinkParams }),
});
const site: Site = {
  id: 'vid',
  hostname: 'video.example',
  label: 'Video',
  enabled: true,
  builtin: false,
  rules: [],
  ignoreParams: ['pp'],
  profiles: [
    {
      view: 'any',
      profile: {
        version: 1,
        hostname: 'video.example',
        pathPattern: '/',
        feeds: [feed('home'), feed('own', ['pp', 'v'])],
      },
    },
  ],
};
const item = (url: string, extra: Partial<GhostItem> = {}): GhostItem => {
  const id = permalinkId(url);
  return {
    key: `${HOST}:${id}`,
    id,
    host: HOST,
    siteId: 'vid',
    view: 'any',
    url,
    title: url,
    excerpt: '',
    state: 'ghost',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
};
const watch = (v: string, pp?: string) =>
  `https://www.video.example/watch?${pp ? `pp=${pp}&` : ''}v=${v}`;

beforeEach(async () => {
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '1.9.0' } as never);
  await Promise.all(db.tables.map((t) => t.clear()));
  for (const s of await listSnapshots()) await deleteSnapshot(s.id);
});
afterEach(cleanup);

describe('planRekey', () => {
  it('moves link-id items the current rules change, leaving the rest alone', () => {
    const old = item(watch('a', '1'));
    const plan = planRekey(
      [
        old,
        item(watch('b')), // already canonical
        item(watch('c', '1'), { feedId: 'own' }), // the feed keeps pp
        item(watch('d', '1'), { feedId: 'home' }),
        { ...item(watch('e', '1')), id: 'i_text' }, // text id
        item(watch('f', '1'), { siteId: 'gone' }),
      ],
      [site, DEVTO_SITE],
    );
    expect(plan).toEqual([
      {
        from: old.key,
        to: `${HOST}:${permalinkId(watch('a'))}`,
        id: permalinkId(watch('a')),
        url: watch('a'),
      },
      expect.objectContaining({ url: watch('d') }),
    ]);
  });
});

describe('mergeItems', () => {
  it('keeps the earlier item, the more active state and every tag', () => {
    const a = item(watch('a'), { createdAt: 5, tags: ['x'], state: 'snoozed', snoozeUntil: 99 });
    const b = item(watch('a', '1'), { createdAt: 2, tags: ['y'], summary: 'S', updatedAt: 7 });
    expect(mergeItems(a, b)).toMatchObject({
      key: b.key,
      createdAt: 2,
      state: 'snoozed',
      snoozeUntil: 99,
      tags: ['y', 'x'],
      summary: 'S',
      updatedAt: 7,
    });
  });
});

describe('applyRekey', () => {
  it('moves items and their rows in one go after a snapshot, merging collisions', async () => {
    const old = item(watch('a', '1'), { createdAt: 1, tags: ['old'], state: 'later' });
    const dup = item(watch('a', '2'), { createdAt: 3, tags: ['dup'] });
    const fresh = item(watch('a'), { createdAt: 5 });
    await db.items.bulkAdd([old, dup, fresh]);
    await db.kept.add({ key: old.key, at: 4 });
    await db.embeddings.add({ key: old.key, model: 'm', dim: 1, vector: [1] });
    await db.contents.add({
      key: dup.key,
      url: dup.url ?? '',
      title: 't',
      html: '',
      text: '',
      fetchedAt: 1,
    });
    await db.aiJobs.add({
      id: 'j',
      kind: 'enrich',
      label: 'l',
      itemKey: old.key,
      status: 'done',
      pausable: true,
      createdAt: 1,
    });

    const plan = planRekey(await db.items.toArray(), [site]);
    expect(plan).toHaveLength(2);
    expect(await applyRekey(plan, 50)).toBe(2);

    const items = await db.items.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: fresh.key,
      url: watch('a'),
      createdAt: 1,
      state: 'later',
      tags: ['old', 'dup'],
    });
    expect(await db.kept.get(fresh.key)).toEqual({ key: fresh.key, at: 4 });
    expect(await db.embeddings.get(fresh.key)).toBeDefined();
    expect(await db.contents.get(fresh.key)).toBeDefined();
    expect(await db.embeddings.count()).toBe(1);
    expect((await db.aiJobs.get('j'))?.itemKey).toBe(fresh.key);
    const [snap] = await listSnapshots();
    expect(snap).toMatchObject({ reason: 'before-rekey', createdAt: 50 });
    expect(snap?.counts.items).toBe(3);
    expect(planRekey(await db.items.toArray(), [site])).toEqual([]);
  });
});

describe('RekeyBanner', () => {
  it('offers the update and reports it', async () => {
    await saveSite(site);
    await db.items.bulkAdd([item(watch('a', '1')), item(watch('b', '1'))]);
    const done = vi.fn();
    render(<RekeyBanner onDone={done} />);
    const banner = await screen.findByRole('region', { name: 'Update item links' });
    expect(banner.textContent).toContain('2 Ghostified items on video.example');
    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: /Update items/ })),
    );
    await vi.waitFor(() =>
      expect(done).toHaveBeenCalledWith(expect.stringContaining('Updated 2 items')),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Update item links' })).toBeNull(),
    );
    expect((await db.items.toArray()).map((i) => i.url).sort()).toEqual([watch('a'), watch('b')]);
  });
});
