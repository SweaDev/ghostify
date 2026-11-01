// @vitest-environment jsdom
// DOMPurify needs a spec-complete DOM; happy-dom mishandles attributes, jsdom is what DOMPurify tests with.
import { grabContent, parseReadable } from '@/src/feed/reader';
import { db } from '@/src/store/db';

const PAGE = `<html><head><title>Rust tips</title></head><body>
  <nav>Home · About</nav>
  <article><h1>Rust tips</h1>
    <p>Ownership is the core of Rust. Every value has a single owner, and the value is dropped when the owner goes out of scope. This keeps memory safe without a garbage collector.</p>
    <p>Borrowing lets code use a value without taking ownership. References are checked at compile time, which rules out data races. <a href="/borrowing">More on borrowing</a>.</p>
    <p onclick="alert(1)">Lifetimes describe how long references are valid, and the compiler infers most of them for you.</p>
    <script>alert(1)</script>
  </article></body></html>`;

describe('reader', () => {
  it('extracts and sanitizes the main content with absolute links', () => {
    const r = parseReadable(PAGE, 'https://blog.test/rust');
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
});
