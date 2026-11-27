import { checkDescriptor, type FeedDescriptor } from 'feedgrab';
import { extractItem } from '@/src/feed/extract';
import { DEVTO_SITE } from '@/src/sites/defaults';
import { devtoDoc } from './devto-fixture';

const ctx = {
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  baseUrl: 'https://dev.to/',
};

const feed = (container: string, item: string): FeedDescriptor => ({
  id: 'f',
  container: { type: 'css', value: container },
  item: { type: 'css', value: item },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
});

function itemsOf(html: string, d: FeedDescriptor) {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return checkDescriptor(doc, d, { baseUrl: 'https://site.test/' }).items;
}

describe('extractItem', () => {
  it('maps a dev.to story through feedgrab content and the built-in field rules', () => {
    const doc = devtoDoc();
    const d = DEVTO_SITE.profiles[0]!.profile.feeds.find((f) => f.id === 'devto-stories')!;
    const [item] = checkDescriptor(doc, d, { baseUrl: 'https://dev.to/' }).items;
    const el = item!.element;
    const draft = extractItem(item!, ctx);
    expect(draft.title).toBe(el.querySelector('h2')?.textContent?.trim());
    expect(draft.url).toMatch(/^https:\/\/dev\.to\//);
    expect(draft.image).toMatch(/^https:\/\/media2\.dev\.to\//);
    expect(draft.image).not.toMatch(/profile_image/);
    expect(draft.author).toBe(el.querySelector('.crayons-story__secondary')?.textContent?.trim());
    expect(draft.excerpt).not.toContain('Follow');
    expect(draft.kind).toBe('post');
    expect(draft.html).toBeTypeOf('string');
    expect(draft).toMatchObject({
      id: item!.id,
      host: 'dev.to',
      siteId: 'devto',
      view: 'loggedOut',
    });
  });

  it('falls back to the text for untitled items and keeps only http(s) links', () => {
    const [item] = itemsOf(
      '<ul><li>just some words without a heading <img class="avatar" src="/a.png"></li><li>x</li></ul>',
      feed('ul', ':scope > li'),
    );
    const d = extractItem(item!, ctx);
    expect(d.title).toBe('just some words without a heading');
    expect(d.url).toBeUndefined();
    expect(d.image).toBeUndefined();
    const bad = {
      ...item!,
      id: item!.id,
      text: item!.text,
      content: item!.content,
      permalink: 'javascript:alert(1)',
    };
    expect(extractItem(bad, ctx).url).toBeUndefined();
  });

  it('keeps playable attributes of a video and its poster as the image', () => {
    const [item] = itemsOf(
      `<div class="g"><div class="v"><a href="https://www.youtube.com/watch?v=abcDEF12345"><img src="/t.jpg" width="320"><span>4:05</span></a><h3>Clip</h3></div></div>`,
      feed('.g', ':scope > .v'),
    );
    const d = extractItem(item!, ctx);
    expect(d.kind).toBe('video');
    expect(d.media).toMatchObject({
      kind: 'video',
      provider: 'youtube',
      providerId: 'abcDEF12345',
      poster: 'https://site.test/t.jpg',
      duration: 245,
    });
    expect(d.image).toBe('https://site.test/t.jpg');
    expect(d.html).toBeUndefined();
  });
});
