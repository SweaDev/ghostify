import { extractItem } from '@/src/feed/extract';
import { devtoDoc } from './devto-fixture';

const ctx = {
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  baseUrl: 'https://dev.to/',
};

describe('extractItem', () => {
  it('extracts dev.to stories', () => {
    const doc = devtoDoc();
    const stories = [...doc.querySelectorAll('#substories > .crayons-story')];
    expect(stories).toHaveLength(3);
    const el = stories[0] as Element;
    const d = extractItem({ id: 'x', element: el, text: () => el.textContent ?? '' }, ctx);
    expect(d.title).toBe(el.querySelector('h2')?.textContent?.trim());
    expect(d.url).toMatch(/^https:\/\/dev\.to\/[^/]+\/.+/);
    expect(d.image).toMatch(/^https:\/\/media2\.dev\.to\//);
    expect(d.image).not.toMatch(/profile_image/);
    expect(d.author?.length).toBeGreaterThan(1);
    expect(d.excerpt.length).toBeLessThanOrEqual(400);
    expect(d).toMatchObject({ id: 'x', host: 'dev.to', siteId: 'devto', view: 'loggedOut' });
  });

  it('falls back for bare items', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML =
      '<li><a href="/p/1">Hello world, this is a post</a> <img class="avatar" src="/a.png"></li>';
    const el = doc.querySelector('li') as Element;
    const d = extractItem({ id: 'y', element: el, text: () => el.textContent ?? '' }, ctx);
    expect(d.title).toBe('Hello world, this is a post');
    expect(d.url).toBe('https://dev.to/p/1');
    expect(d.image).toBeUndefined();
  });
});
