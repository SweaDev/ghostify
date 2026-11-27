// @vitest-environment jsdom
// DOMPurify needs a spec-complete DOM; happy-dom mishandles attributes, jsdom is what DOMPurify tests with.
import { grabContent, MAX_PAGE_BYTES, pageFacts, parsePage } from '@/src/feed/reader';
import { db, type GhostItem } from '@/src/store/db';

const PAGE = `<html><head><title>Rust tips</title></head><body>
  <nav>Home · About</nav>
  <article><h1>Rust tips</h1>
    <p>Ownership is the core of Rust. Every value has a single owner, and the value is dropped when the owner goes out of scope. This keeps memory safe without a garbage collector.</p>
    <p>Borrowing lets code use a value without taking ownership. References are checked at compile time, which rules out data races. <a href="/borrowing">More on borrowing</a>.</p>
    <p onclick="alert(1)">Lifetimes describe how long references are valid, and the compiler infers most of them for you.</p>
    <script>alert(1)</script>
  </article></body></html>`;

const VIDEO_PAGE = `<html><head><title>Harbor lights</title>
  <meta property="og:type" content="video.other">
  <meta property="og:image" content="https://i.test/poster.jpg">
  <meta property="og:video:url" content="https://www.youtube.com/embed/abcDEF12345">
  <meta name="author" content="Maker Channel">
  <script type="application/ld+json">{"@type":"VideoObject","name":"Harbor lights","duration":"PT4M5S","uploadDate":"2026-10-04T08:00:00Z"}</script>
  </head><body><h1>Harbor lights</h1><p>Short.</p></body></html>`;

const item = (over: Partial<GhostItem>): GhostItem => ({
  key: 'tube.test:v',
  id: 'v',
  host: 'tube.test',
  siteId: 'tube',
  view: 'any',
  title: 'Harbor lights',
  excerpt: '',
  url: 'https://tube.test/watch/v',
  state: 'ghost',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('reader', () => {
  it('extracts and sanitizes the main content with absolute links', () => {
    const r = parsePage(PAGE, 'https://blog.test/rust').article;
    expect(r?.text).toContain('single owner');
    expect(r?.text).not.toContain('Home · About');
    expect(r?.html).not.toMatch(/<script|onclick/);
    expect(r?.html).toContain('href="https://blog.test/borrowing"');
    expect(r?.html).toContain('target="_blank"');
  });

  it('grabs a page and keeps AI notes made before', async () => {
    await db.contents.put({
      key: 'k',
      url: '',
      title: '',
      html: '',
      text: '',
      fetchedAt: 0,
      digest: 'old',
    });
    const fetcher = vi.fn(async () => new Response(PAGE)) as unknown as typeof fetch;
    const row = await grabContent('k', 'https://blog.test/rust', fetcher);
    expect(row).toMatchObject({ key: 'k', title: 'Rust tips', digest: 'old' });
    const bad = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(grabContent('k', 'https://blog.test/x', bad)).rejects.toThrow('404');
  });

  it('refuses non-web links, non-HTML and oversized pages', async () => {
    const ok = vi.fn(async () => new Response(PAGE)) as unknown as typeof fetch;
    await expect(grabContent('k', 'file:///etc/passwd', ok)).rejects.toThrow(/web pages/);
    const pdf = vi.fn(
      async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
    ) as unknown as typeof fetch;
    await expect(grabContent('k', 'https://blog.test/a.pdf', pdf)).rejects.toThrow(
      /Not a web page/,
    );
    const huge = vi.fn(
      async () => new Response('x'.repeat(MAX_PAGE_BYTES + 10)),
    ) as unknown as typeof fetch;
    await expect(grabContent('k', 'https://blog.test/big', huge)).rejects.toThrow(/too large/);
  });

  it("fills a video item's missing player, date, author and image from its page", async () => {
    const { page } = parsePage(VIDEO_PAGE, 'https://tube.test/watch/v');
    expect(pageFacts(item({ kind: 'video' }), page)).toEqual({
      media: {
        kind: 'video',
        embedUrl: 'https://www.youtube-nocookie.com/embed/abcDEF12345',
        provider: 'youtube',
        providerId: 'abcDEF12345',
        poster: 'https://i.test/poster.jpg',
        duration: 245,
      },
      author: 'Maker Channel',
      publishedAt: '2026-10-04T08:00:00.000Z',
      image: 'https://i.test/poster.jpg',
    });
    await db.items.put(item({ kind: 'video' }));
    const fetcher = vi.fn(async () => new Response(VIDEO_PAGE)) as unknown as typeof fetch;
    await grabContent('tube.test:v', 'https://tube.test/watch/v', fetcher).catch(() => undefined);
    const saved = await db.items.get('tube.test:v');
    expect(saved?.media?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/abcDEF12345');
    expect(saved?.kind).toBe('video');
  });

  it("never changes a post's kind or an item's own player and facts", () => {
    const { page } = parsePage(VIDEO_PAGE, 'https://tube.test/watch/v');
    const post = pageFacts(
      item({ kind: 'post', author: 'Ana', image: 'https://i.test/own.jpg' }),
      page,
    );
    expect(post).toEqual({ publishedAt: '2026-10-04T08:00:00.000Z' });
    const own = pageFacts(
      item({ kind: 'video', media: { kind: 'video', url: 'https://cdn.test/v.mp4' } }),
      page,
    );
    expect(own.media).toBeUndefined();
  });
});
