import { type FeedDescriptor, suggestPermalinks } from 'feedgrab';
import { chooseLinks } from '@/src/sites/link-chooser';
import { checkFeed, migrateLinks, optionLabel, withPermalink } from '@/src/sites/links';

const BASE = 'https://x.example/home';
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

/** X-like posts: avatar and name link to the author; the time links to the post. */
function page() {
  const post = (user: string, id: string) => `
    <article>
      <a href="/${user}"><img alt=""></a>
      <a href="/${user}" role="link">${user}</a>
      <a href="/${user}/status/${id}"><time datetime="2026-11-05">3h</time></a>
      <a href="/${user}/status/${id}/photo/1"><img alt="photo"></a>
    </article>`;
  document.body.innerHTML = `<main>${post('alice', '1')}${post('bob', '2')}</main>`;
  return document;
}

describe('links', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('checks a descriptor like the runtime: heuristic or post-link selector', () => {
    const doc = page();
    const auto = checkFeed(doc, feed, BASE);
    expect(auto.items.map((i) => i.permalink)).toEqual([
      'https://x.example/alice/status/1',
      'https://x.example/bob/status/2',
    ]);
    const author = checkFeed(
      doc,
      withPermalink(feed, { type: 'css', value: 'a[role="link"]' }),
      BASE,
    );
    expect(author.items[0]?.permalink).toBe('https://x.example/alice');
    expect(author.linkHits).toBe(2);
    const none = checkFeed(doc, withPermalink(feed, { type: 'css', value: '.nope' }), BASE);
    expect(none.linkHits).toBe(0);
    expect(none.items[0]?.permalink).toBe('https://x.example/alice/status/1');
    expect(checkFeed(doc, { ...feed, item: { type: 'css', value: 'a[' } }, BASE).items).toEqual([]);
  });

  it('labels suggestions and moves 1.4.6 links onto feeds', () => {
    const [top] = suggestPermalinks([...page().querySelectorAll('article')], BASE);
    if (!top) throw new Error('no suggestion');
    expect(optionLabel(top, BASE)).toBe('/alice/status/1 · 3h');
    expect(optionLabel({ ...top, url: 'https://t.co/a' }, BASE)).toBe('https://t.co/a · 3h');
    expect(
      withPermalink({ ...feed, permalink: top.selector }, { type: 'css', value: ' ' }),
    ).toEqual(feed);

    const entry = { view: 'any', profile: { feeds: [feed] } };
    const sel = { type: 'css' as const, value: 'a:has(time)' };
    const moved = migrateLinks({ ...entry, links: { f: { selector: sel } } });
    expect(moved).toEqual({ view: 'any', profile: { feeds: [{ ...feed, permalink: sel }] } });
    expect(migrateLinks(entry)).toBe(entry);
  });
});

describe('chooseLinks', () => {
  afterEach(() => {
    for (const n of document.querySelectorAll('[data-ghostify-chooser]')) n.remove();
    document.body.innerHTML = '';
  });

  const open = () => {
    const doc = page();
    const options = suggestPermalinks([...doc.querySelectorAll('article')], BASE);
    const selector = options[0]?.selector ?? { type: 'css' as const, value: '' };
    const p = chooseLinks(doc, BASE, [{ descriptor: feed, options, selector }]);
    const root = doc.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    return { p, options, $ };
  };

  it('pre-selects the best suggestion and saves a custom selector', async () => {
    const { p, $ } = open();
    const choice = $<HTMLSelectElement>('select.choice');
    expect(choice.value).toBe('0');
    expect($('.opens').textContent).toBe(
      'Opens: https://x.example/alice/status/1 (found in 2 of 2 posts)',
    );

    const input = $<HTMLInputElement>('input');
    input.value = 'a[role="link"]';
    input.dispatchEvent(new Event('input'));
    expect(choice.value).toBe('custom');
    expect($('.opens').textContent).toContain('Opens: https://x.example/alice ');
    input.value = '.nope';
    input.dispatchEvent(new Event('input'));
    expect($('.opens').textContent).toMatch(/finds no link in any of the 2 posts/);
    input.value = ' a[role="link"] ';
    input.dispatchEvent(new Event('input'));
    $<HTMLButtonElement>('.next').click();
    expect(await p).toEqual({ f: { type: 'css', value: 'a[role="link"]' } });
  });

  it('saves automatic as an empty selector and resolves null on cancel', async () => {
    const a = open();
    const choice = a.$<HTMLSelectElement>('select.choice');
    choice.value = 'auto';
    choice.dispatchEvent(new Event('change'));
    expect(a.$<HTMLInputElement>('input').value).toBe('');
    expect(a.$('.opens').textContent).toBe('Automatic: opens https://x.example/alice/status/1');
    a.$<HTMLButtonElement>('.next').click();
    expect(await a.p).toEqual({ f: { type: 'css', value: '' } });

    const b = open();
    b.$<HTMLButtonElement>('.cancel').click();
    expect(await b.p).toBeNull();
  });
});
