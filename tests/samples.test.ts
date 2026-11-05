import { guard } from '@/src/background/guard';
import type { RuntimeApi } from '@/src/feed/api';
import { startFeedRuntime } from '@/src/feed/runtime';
import { DEVTO_SITE } from '@/src/sites/defaults';
import {
  deleteSamples,
  getSamples,
  renameSamples,
  SAMPLE_MAX_AGE,
  samplesNeeded,
  saveSample,
} from '@/src/store/samples';
import { devtoDoc } from './devto-fixture';

const EXT = 'chrome-extension://abc/';
const page = { url: 'https://dev.to/latest', tab: { id: 1 } };
const row = { siteId: 's', feedId: 'a', url: 'https://dev.to/', html: '<html></html>' };

describe('sample store', () => {
  it('reports missing or old samples, renames and deletes them', async () => {
    await saveSample(row);
    await saveSample({ ...row, feedId: 'b' });
    expect(await samplesNeeded('s', ['a', 'b', 'c'])).toEqual(['c']);
    expect(await samplesNeeded('s', ['a'], Date.now() + SAMPLE_MAX_AGE + 1)).toEqual(['a']);
    await renameSamples('s', { a: 'a2' });
    expect((await getSamples('s')).map((r) => r.feedId).sort()).toEqual(['a2', 'b']);
    await deleteSamples('s', ['b']);
    expect((await getSamples('s')).map((r) => r.key)).toEqual(['s|a2']);
    await deleteSamples('s');
    expect(await getSamples('s')).toEqual([]);
  });
});

describe('sample messages from pages', () => {
  it('accept only the sender host and bounded samples', () => {
    const ok = { siteId: 'devto', feedId: 'f', url: 'https://dev.to/', html: '<p>' };
    expect(guard('saveSample', ok, page, EXT)).toEqual(ok);
    expect(() => guard('saveSample', { ...ok, url: 'https://evil.com/' }, page, EXT)).toThrow(
      /host/,
    );
    expect(() => guard('saveSample', { ...ok, html: 'x'.repeat(30000) }, page, EXT)).toThrow(
      /large/,
    );
    const need = guard(
      'samplesNeeded',
      { siteId: 'devto', feedIds: ['a', 1, 'b'] as string[], url: 'https://dev.to/' },
      page,
      EXT,
    );
    expect(need).toEqual({ siteId: 'devto', feedIds: ['a', 'b'], url: 'https://dev.to/' });
  });
});

describe('runtime samples', () => {
  it('saves a two-item sample of feeds that need one', async () => {
    const doc = devtoDoc();
    document.body.innerHTML = doc.body.innerHTML;
    const saved: { feedId: string; html: string }[] = [];
    const api: RuntimeApi = {
      isGhosted: async () => [],
      ghostify: async () => {
        throw new Error('unused');
      },
      unghost: async () => {},
      autoGhostify: async () => null,
      samplesNeeded: vi.fn(async (_s: string, ids: string[]) => ids),
      saveSample: vi.fn(async (_s: string, feedId: string, _u: string, html: string) => {
        saved.push({ feedId, html });
      }),
    };
    const rt = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [DEVTO_SITE],
      api,
    });
    expect(rt.active).toBe(true);
    await vi.waitFor(() => expect(saved.map((x) => x.feedId)).toContain('devto-stories'));
    for (const x of saved) {
      expect(new TextEncoder().encode(x.html).length).toBeLessThanOrEqual(20000);
      expect(api.saveSample).toHaveBeenCalledWith('devto', x.feedId, 'https://dev.to/', x.html);
    }
    const stories = saved.find((x) => x.feedId === 'devto-stories')?.html ?? '';
    const copy = new DOMParser().parseFromString(stories, 'text/html');
    expect(copy.querySelectorAll('#substories .crayons-story')).toHaveLength(2);
    expect(stories).not.toMatch(/<script[^>]*>[^<]/);
    rt.dispose();
  });
});
