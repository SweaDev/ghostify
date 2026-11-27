import { fakeBrowser } from 'wxt/testing/fake-browser';
import { backfillThumbs, imageOrigins, makeThumb, type ThumbDeps } from '@/src/background/thumbs';
import { createBackup } from '@/src/store/backup';
import { db } from '@/src/store/db';
import { ghostify, unghost } from '@/src/store/items';

const draft = (id: string, image?: string) => ({
  id,
  host: 'site.test',
  siteId: 'site',
  view: 'any' as const,
  title: `Post ${id}`,
  excerpt: '',
  ...(image && { image }),
});

function deps(over: Partial<ThumbDeps> = {}): ThumbDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    fetch: async (url) => {
      fetched.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    },
    canFetch: async () => true,
    encode: async () => ({
      data: new Uint8Array([9]).buffer,
      type: 'image/webp',
      width: 32,
      height: 18,
    }),
    ...over,
  };
}

beforeEach(() => Promise.all([db.items.clear(), db.thumbs.clear()]));

describe('thumbnails', () => {
  it('saves an encoded thumbnail once per image, and never without access', async () => {
    await ghostify(draft('a', 'https://img.test/a.jpg'));
    const d = deps();
    expect(await makeThumb('site.test:a', d)).toBe(true);
    expect(await makeThumb('site.test:a', d)).toBe(true);
    expect(d.fetched).toEqual(['https://img.test/a.jpg']);
    expect(await db.thumbs.get('site.test:a')).toMatchObject({
      type: 'image/webp',
      width: 32,
      src: 'https://img.test/a.jpg',
    });
    await ghostify(draft('b', 'https://img.test/b.jpg'));
    const denied = deps({ canFetch: async () => false });
    expect(await makeThumb('site.test:b', denied)).toBe(false);
    expect(denied.fetched).toEqual([]);
  });

  it('skips items without images, non-images, failed encodes and errors', async () => {
    await ghostify(draft('none'));
    expect(await makeThumb('site.test:none', deps())).toBe(false);
    await ghostify(draft('c', 'https://img.test/c'));
    const html = deps({
      fetch: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    });
    expect(await makeThumb('site.test:c', html)).toBe(false);
    expect(await makeThumb('site.test:c', deps({ encode: async () => null }))).toBe(false);
    const broken = deps({
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(await makeThumb('site.test:c', broken)).toBe(false);
    expect(await db.thumbs.count()).toBe(0);
  });

  it('backfills a site, lists its image origins, and goes away with the item', async () => {
    await ghostify(draft('a', 'https://img.test/a.jpg'));
    await ghostify(draft('b', 'https://cdn.test/b.jpg'));
    await ghostify({ ...draft('x', 'https://img.test/x.jpg'), siteId: 'other' });
    expect(await imageOrigins('site')).toEqual(['https://cdn.test/*', 'https://img.test/*']);
    expect(await backfillThumbs('site', deps())).toBe(2);
    expect(await backfillThumbs('site', deps())).toBe(0);
    await unghost('site.test:a');
    expect(await db.thumbs.get('site.test:a')).toBeUndefined();
  });

  it('keeps thumbnails out of backups', async () => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '1.11.0' } as never);
    await ghostify(draft('a', 'https://img.test/a.jpg'));
    await makeThumb('site.test:a', deps());
    const full = await createBackup('full');
    expect(Object.keys(full.tables)).not.toContain('thumbs');
    expect(Object.keys(full.tables)).toContain('items');
  });
});
