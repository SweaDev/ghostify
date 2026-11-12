import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { applyBackup, createBackup, parseBackup } from '@/src/store/backup';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  MAX_AUTO_SNAPSHOTS,
  restoreBackup,
  takeSnapshot,
} from '@/src/store/snapshots';

const draft = (id: string) => ({
  id,
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  title: `Post ${id}`,
  excerpt: '',
  url: `https://dev.to/x/${id}`,
});

beforeEach(async () => {
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '1.8.0' } as never);
  await Promise.all(db.tables.map((t) => t.clear()));
  for (const s of await listSnapshots()) await deleteSnapshot(s.id);
});

describe('backups', () => {
  it('data backups hold only items and kept, and merge newer rows on restore', async () => {
    await ghostify(draft('a'), 1);
    await db.kept.add({ key: 'dev.to:k', at: 1 });
    await db.embeddings.add({ key: 'dev.to:a', model: 'm', dim: 1, vector: [1] });
    await db.secrets.add({ id: 'openai', value: 'sk' });
    const b = parseBackup(JSON.stringify(await createBackup('data', 5)));
    expect(Object.keys(b.tables).sort()).toEqual(['items', 'kept']);
    expect(b.storage).toBeUndefined();

    await db.items.update('dev.to:a', { title: 'Mine', updatedAt: 9 });
    await ghostify(draft('c'), 2);
    const [a] = (b.tables.items ?? []) as object[];
    const c = await db.items.get('dev.to:c');
    await applyBackup({
      ...b,
      tables: {
        ...b.tables,
        items: [a, { ...c, title: 'Old', updatedAt: 1 }, { ...a, key: 'dev.to:b', id: 'b' }],
      },
    });
    expect((await db.items.get('dev.to:a'))?.title).toBe('Mine');
    expect((await db.items.get('dev.to:c'))?.title).toBe('Post c');
    expect(await db.items.get('dev.to:b')).toBeDefined();
    expect(await db.secrets.get('openai')).toBeDefined();
  });

  it('full backups replace every table but secrets, plus sites and settings', async () => {
    await ghostify(draft('a'), 1);
    await db.secrets.add({ id: 'openai', value: 'sk' });
    await storage.setItem('local:settings', { ui: { semantic: true } });
    const b = await createBackup('full', 5);
    expect(b.tables.secrets).toBeUndefined();
    expect(b.tables.items).toHaveLength(1);
    expect(b.storage?.['local:settings']).toEqual({ ui: { semantic: true } });

    await ghostify(draft('b'), 2);
    await storage.setItem('local:settings', { ui: { semantic: false } });
    await applyBackup(b);
    expect((await db.items.toArray()).map((i) => i.id)).toEqual(['a']);
    expect(await storage.getItem('local:settings')).toEqual({ ui: { semantic: true } });
    expect(await storage.getItem('local:sites')).toBeNull();
    expect(await db.secrets.get('openai')).toBeDefined();
  });

  it('rejects files that are not Ghostify backups or carry secrets', () => {
    expect(() => parseBackup('{}')).toThrow('Not a Ghostify backup');
    expect(() =>
      parseBackup({ format: 'ghostify-backup', kind: 'full', tables: { secrets: [] } }),
    ).toThrow('never hold secrets');
    expect(() =>
      parseBackup({ format: 'ghostify-backup', kind: 'data', tables: { items: [1] } }),
    ).toThrow('Bad rows');
  });
});

describe('snapshots', () => {
  it('a restore takes a snapshot first, so it can be undone', async () => {
    await ghostify(draft('a'), 1);
    const first = await takeSnapshot('manual', 10);
    await ghostify(draft('b'), 2);
    await restoreBackup(await getSnapshot(first.id), 20);
    expect((await db.items.toArray()).map((i) => i.id)).toEqual(['a']);

    const [undo] = await listSnapshots();
    expect(undo).toMatchObject({ reason: 'before-restore', createdAt: 20 });
    expect(undo?.counts.items).toBe(2);
    await restoreBackup(await getSnapshot(undo?.id ?? ''), 30);
    expect(await db.items.count()).toBe(2);
  });

  it('keeps the newest automatic snapshots and every manual one', async () => {
    await takeSnapshot('manual', 0);
    for (let t = 1; t <= MAX_AUTO_SNAPSHOTS + 2; t++) await takeSnapshot('before-rekey', t);
    const all = await listSnapshots();
    expect(all.filter((s) => s.reason === 'manual')).toHaveLength(1);
    expect(all.filter((s) => s.reason !== 'manual').map((s) => s.createdAt)).toEqual([
      7, 6, 5, 4, 3,
    ]);
    await expect(getSnapshot(all.at(-1)?.id ?? '')).resolves.toMatchObject({ kind: 'full' });
  });
});
