import {
  type FeedDescriptor,
  type ItemStructure,
  partText,
  type StructurePart,
  structureCoverage,
} from 'feedgrab';
import { isPageCustomized } from '@/src/sites/builtin';
import { DEVTO_SITE } from '@/src/sites/defaults';
import {
  defaultReference,
  sameStructure,
  startingParts,
  suggestParts,
  withStructure,
} from '@/src/sites/structure';

const feed: FeedDescriptor = {
  id: 'f',
  container: { type: 'css', value: 'main' },
  item: { type: 'css', value: ':scope > article' },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
};

/** A heading row and an ad share the item selector with posts; only some posts have a photo. */
function page() {
  const post = (id: number, photo: boolean) => `
    <article>
      <a href="/u${id}">user ${id}</a>
      <a href="/u${id}/status/${id}"><time>3h</time></a>
      ${photo ? `<img class="thumb" alt="photo ${id}">` : ''}
      <p>Post ${id} text</p>
    </article>`;
  document.body.innerHTML = `<main><article><h2>Latest</h2></article><article><a href="https://ads.test">Ad</a><p>Buy it</p></article>${[1, 2, 3, 4, 5, 6].map((i) => post(i, i % 2 === 1)).join('')}</main>`;
  return [...document.querySelectorAll('main > article')];
}

const time: ItemStructure = {
  parts: [
    { selector: { type: 'css', value: 'time' }, required: true, label: 'time' },
    { selector: { type: 'css', value: 'img.thumb' }, required: false, label: 'image' },
  ],
};

describe('structure helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('suggests parts from the sample post and finds it again by structure', () => {
    const items = page();
    const parts = suggestParts(items, 2);
    expect(parts.find((p) => p.label === 'time')).toEqual({
      selector: { type: 'css', value: 'time' },
      required: true,
      label: 'time',
    });
    expect(parts.find((p) => p.label === 'image')?.required).toBe(false);
    expect(structureCoverage(items, { parts })).toBe(6);
    expect(structureCoverage(items)).toBe(8);
    // The first post with the time and the most optional parts (the photo) is post 1.
    expect(defaultReference(items, time)).toBe(2);
    expect(defaultReference(items.slice(3), time)).toBe(1);
    expect(defaultReference(items.slice(0, 2), time)).toBe(0);
    expect(defaultReference(items)).toBe(0);
    expect(partText(items[2] as Element, time.parts[1] as StructurePart)).toBe('photo 1');
  });

  it('starts from the saved parts for the saved sample post, else suggests', () => {
    const items = page();
    const custom: ItemStructure = {
      parts: [{ ...(time.parts[0] as StructurePart), label: 'mine' }],
    };
    expect(startingParts(items, 2, custom)).toBe(custom.parts);
    expect(startingParts(items, 3, custom)).not.toBe(custom.parts);
    expect(startingParts(items, 3)).toEqual(suggestParts(items, 3));
  });

  it('sets or drops structures and tells changed ones apart', () => {
    expect(withStructure(feed, time).structure).toBe(time);
    expect(withStructure({ ...feed, structure: time }, { parts: [] })).not.toHaveProperty(
      'structure',
    );
    expect(sameStructure(time, { parts: time.parts.map(({ label: _, ...p }) => p) })).toBe(true);
    expect(sameStructure(time, undefined)).toBe(false);
    const [entry] = DEVTO_SITE.profiles;
    if (!entry) throw new Error('no page');
    const shaped = {
      ...entry,
      profile: {
        ...entry.profile,
        feeds: entry.profile.feeds.map((f) => withStructure(f, time)),
      },
    };
    expect(isPageCustomized(shaped, entry)).toBe(true);
  });
});
