import type { FeedDescriptor, ItemStructure, StructurePart } from 'feedgrab';
import { isPageCustomized } from '@/src/sites/builtin';
import { DEVTO_SITE } from '@/src/sites/defaults';
import {
  countMatching,
  defaultReference,
  partText,
  sameStructure,
  startingParts,
  suggestParts,
  withStructure,
} from '@/src/sites/structure';
import { chooseStructure } from '@/src/sites/structure-chooser';

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
    expect(countMatching(items, { parts })).toBe(6);
    expect(countMatching(items)).toBe(8);
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

describe('chooseStructure', () => {
  afterEach(() => {
    for (const n of document.querySelectorAll('[data-ghostify-chooser]')) n.remove();
    document.body.innerHTML = '';
  });

  const open = () => {
    const items = page();
    const parts = suggestParts(items, 2);
    const p = chooseStructure(document, [{ descriptor: feed, items, reference: 2, parts }]);
    const root = document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    return { p, parts, root, $ };
  };

  it('shows the parts with coverage, counts matches and outlines items without them', async () => {
    const { p, parts, root, $ } = open();
    expect($('.matches').textContent).toBe('6 of 8 items have every required part.');
    expect(root.querySelectorAll('.hl.off').length).toBe(2);
    expect(root.querySelectorAll('.hl.sample').length).toBe(1);
    const image = $<HTMLInputElement>('input[aria-label="Require image img.thumb"]');
    expect(image.checked).toBe(false);
    expect(image.closest('label')?.textContent).toContain('“photo 1”in 3 of 8 posts');

    // Requiring the photo leaves only half the posts; hovering it outlines it in the sample post.
    image.checked = true;
    image.dispatchEvent(new Event('change'));
    expect($('.matches').textContent).toBe('3 of 8 items have every required part.');
    image.closest('label')?.dispatchEvent(new Event('mouseenter'));
    expect(root.querySelectorAll('.hl.part').length).toBe(1);

    $<HTMLButtonElement>('.next').click();
    const out = await p;
    expect(out?.f?.parts).toEqual(
      parts.map((x) => (x.label === 'image' ? { ...x, required: true } : x)),
    );
    expect(document.querySelector('[data-ghostify-chooser]')).toBeNull();
  });

  it('warns when nothing matches, suggests again and resolves null on cancel', async () => {
    const { p, root, $ } = open();
    for (const box of root.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    // Every part, the photo too: posts 1, 3 and 5.
    expect($('.matches').textContent).toBe('3 of 8 items have every required part.');
    for (const box of root.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      box.checked = false;
      box.dispatchEvent(new Event('change'));
    }
    expect($('.matches').textContent).toBe(
      'No part is required, so the button shows on all 8 items.',
    );
    $<HTMLButtonElement>('.again').click();
    expect($('.matches').textContent).toBe('6 of 8 items have every required part.');
    $<HTMLButtonElement>('.cancel').click();
    expect(await p).toBeNull();
  });

  it('warns when no item has every required part', () => {
    const items = page();
    const parts = [{ selector: { type: 'css' as const, value: '.nope' }, required: true }];
    chooseStructure(document, [{ descriptor: feed, items, reference: 2, parts }]);
    const root = document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const m = root.querySelector('.matches');
    expect(m?.className).toBe('matches warn');
    expect(m?.textContent).toMatch(/^No item has every required part/);
  });
});
