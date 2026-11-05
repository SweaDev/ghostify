import { extractItem } from '@/src/feed/extract';
import { chooseLinks } from '@/src/sites/link-chooser';
import { deepestIndex, linkOptions, optionLabel, pathDepth, urlIn } from '@/src/sites/links';

const BASE = 'https://x.example/home';

/** X-like posts: avatar and name link to the author; the time links to the post. */
function feed() {
  const doc = document.implementation.createHTMLDocument('t');
  const post = (user: string, id: string, extra = '') => `
    <article class="css-1x2y">
      ${extra}
      <a href="/${user}" class="css-9"><img src="/a.png"></a>
      <div><a href="/${user}" role="link">${user}</a>
      <a href="/${user}/status/${id}" class="r-3"><time datetime="2026-11-05">3h</time></a></div>
      <div>Hello from ${user}</div>
    </article>`;
  doc.body.innerHTML = `<main>${post('alice', '1')}${post('bob', '2', '<a href="/bob">bob reposted</a>')}</main>`;
  return [...doc.querySelectorAll('article')];
}

describe('links', () => {
  it('ranks URLs by path depth, first on ties', () => {
    expect(pathDepth('https://x.example/alice/status/1/')).toBe(3);
    expect(deepestIndex(['https://a/u', 'https://a/u/p', 'https://a/v/q'])).toBe(1);
    expect(deepestIndex([])).toBe(-1);
  });

  it('lists distinct links of the first item with selectors that carry over', () => {
    const items = feed();
    const opts = linkOptions(items, BASE);
    expect(opts.map((o) => o.url)).toEqual([
      'https://x.example/alice',
      'https://x.example/alice/status/1',
    ]);
    const status = opts[deepestIndex(opts.map((o) => o.url))];
    if (!status) throw new Error('no option');
    expect(optionLabel(status, BASE)).toBe('/alice/status/1 · 3h');
    expect(urlIn(items[1] as Element, status.selector, BASE)).toBe(
      'https://x.example/bob/status/2',
    );
  });

  it('uses the stored link selector, else the deepest link', () => {
    const [el] = feed();
    if (!el) throw new Error('no item');
    const item = { id: 'a', feedId: 'f', element: el, text: () => '' };
    const ctx = { host: 'x.example', siteId: 'x', view: 'any' as const, baseUrl: BASE };
    expect(extractItem(item, ctx).url).toBe('https://x.example/alice/status/1');
    const links = { f: { selector: { type: 'css' as const, value: 'a[role="link"]' } } };
    expect(extractItem(item, { ...ctx, links }).url).toBe('https://x.example/alice');
    const none = { f: { selector: { type: 'css' as const, value: '.missing' } } };
    expect(extractItem(item, { ...ctx, links: none }).url).toBe('https://x.example/alice/status/1');
  });
});

describe('chooseLinks', () => {
  afterEach(() => {
    for (const n of document.querySelectorAll('[data-ghostify-chooser]')) n.remove();
  });

  const open = () => {
    const items = feed();
    const options = linkOptions(items, BASE);
    const selector = options[1]?.selector ?? { type: 'css' as const, value: '' };
    const p = chooseLinks(document, BASE, [{ feedId: 'f', item: items[0], options, selector }]);
    const root = document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    return { p, options, $ };
  };

  it('pre-selects the given link and saves another choice or a custom selector', async () => {
    const { p, options, $ } = open();
    const choice = $<HTMLSelectElement>('select.choice');
    const input = $<HTMLInputElement>('input');
    expect(choice.value).toBe('1');
    expect($('.opens').textContent).toBe('Opens: https://x.example/alice/status/1');

    input.value = 'div > a[role="link"]';
    input.dispatchEvent(new Event('input'));
    expect(choice.value).toBe('custom');
    expect($('.opens').textContent).toBe('Opens: https://x.example/alice');
    $<HTMLButtonElement>('.next').click();
    expect(await p).toEqual({
      f: { selector: { type: 'css', value: 'div > a[role="link"]' }, options },
    });
  });

  it('saves automatic as an empty selector and resolves null on cancel', async () => {
    const a = open();
    const choice = a.$<HTMLSelectElement>('select.choice');
    choice.value = 'auto';
    choice.dispatchEvent(new Event('change'));
    expect(a.$<HTMLInputElement>('input').value).toBe('');
    a.$<HTMLButtonElement>('.next').click();
    expect((await a.p)?.f?.selector.value).toBe('');

    const b = open();
    b.$<HTMLButtonElement>('.cancel').click();
    expect(await b.p).toBeNull();
  });
});
