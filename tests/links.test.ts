import { type FeedDescriptor, suggestPermalinks } from 'feedgrab';
import { chooseLinks } from '@/src/sites/link-chooser';
import {
  checkFeed,
  cleanParams,
  linkParams,
  migrateLinks,
  optionLabel,
  paramOptions,
  postLinkOf,
  samePostLink,
  toggleIgnored,
  toggleParam,
  withIgnore,
  withPostLink,
} from '@/src/sites/links';

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
      withPostLink(feed, { selector: { type: 'css', value: 'a[role="link"]' } }),
      BASE,
    );
    expect(author.items[0]?.permalink).toBe('https://x.example/alice');
    expect(author.linkHits).toBe(2);
    const none = checkFeed(
      doc,
      withPostLink(feed, { selector: { type: 'css', value: '.nope' } }),
      BASE,
    );
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
      withPostLink(
        { ...feed, permalink: top.selector, permalinkParams: ['v'] },
        { selector: { type: 'css', value: ' ' } },
      ),
    ).toEqual(feed);

    const entry = { view: 'any', profile: { feeds: [feed] } };
    const sel = { type: 'css' as const, value: 'a:has(time)' };
    const moved = migrateLinks({ ...entry, links: { f: { selector: sel } } });
    expect(moved).toEqual({ view: 'any', profile: { feeds: [{ ...feed, permalink: sel }] } });
    expect(migrateLinks(entry)).toBe(entry);
  });

  it('keeps only the chosen query parameters in post links', () => {
    document.body.innerHTML = `<main>${['a', 'b', 'c']
      .map(
        (v, i) =>
          `<article><h3><a href="/watch?pp=${i ? 'x' : 'y'}&v=${v}">${v}</a></h3></article>`,
      )
      .join('')}</main>`;
    const all = checkFeed(document, feed, BASE);
    expect(all.items[0]?.permalink).toBe('https://x.example/watch?pp=y&v=a');
    const found = linkParams(all.items, feed, BASE);
    expect(found.map((p) => p.name)).toEqual(['pp', 'v']);

    const options = paramOptions(found);
    expect(options).toEqual([
      { name: 'pp', value: 'y', note: 'repeats across posts', kept: true },
      { name: 'v', value: 'a', note: 'different in each post', kept: true },
    ]);
    const params = toggleParam(options, 'pp', false);
    expect(params).toEqual(['v']);
    const d = withPostLink(feed, { selector: { type: 'css', value: '' }, params });
    expect(d).toEqual({ ...feed, permalinkParams: ['v'] });
    expect(postLinkOf(d)).toEqual({ selector: { type: 'css', value: '' }, params: ['v'] });
    expect(samePostLink(d, feed)).toBe(false);
    expect(samePostLink(d, { ...feed, permalinkParams: ['v'] })).toBe(true);
    expect(checkFeed(document, d, BASE).items.map((i) => i.permalink)).toEqual([
      'https://x.example/watch?v=a',
      'https://x.example/watch?v=b',
      'https://x.example/watch?v=c',
    ]);
    expect(toggleParam(paramOptions(found, ['v']), 'pp', true)).toEqual(['pp', 'v']);
    expect(toggleParam(options, 'v', false)).toEqual(['pp']);
    expect(paramOptions([], ['id'])).toEqual([
      { name: 'id', note: 'not in these posts', kept: true },
    ]);

    // The site's ignored params: unticked, dropped from ids unless the feed chose its own.
    expect(paramOptions(found, undefined, ['pp', 'si']).map((o) => [o.name, o.kept])).toEqual([
      ['pp', false],
      ['si', false],
      ['v', true],
    ]);
    expect(toggleIgnored(['pp'], 'si', false)).toEqual(['pp', 'si']);
    expect(toggleIgnored(['pp', 'si'], 'pp', true)).toEqual(['si']);
    expect(cleanParams([' pp', 'pp', '', 'a=b', 'si'])).toEqual(['pp', 'si']);
    const site = withIgnore(feed, ['pp']);
    expect(site.permalinkIgnore).toEqual(['pp']);
    expect(withIgnore(site, [])).toEqual(feed);
    expect(withIgnore(d, ['pp']).permalinkIgnore).toBeUndefined();
    expect(checkFeed(document, site, BASE).items.map((i) => i.permalink)).toEqual([
      'https://x.example/watch?v=a',
      'https://x.example/watch?v=b',
      'https://x.example/watch?v=c',
    ]);
  });
});

describe('chooseLinks', () => {
  afterEach(() => {
    for (const n of document.querySelectorAll('[data-ghostify-chooser]')) n.remove();
    document.body.innerHTML = '';
  });

  const open = () => {
    const doc = page();
    const items = [...doc.querySelectorAll('article')];
    const options = suggestPermalinks(items, BASE);
    const p = chooseLinks(doc, BASE, [{ descriptor: feed, items, reference: 0 }]);
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
    expect(await p).toEqual({
      links: { f: { link: { selector: { type: 'css', value: 'a[role="link"]' } }, reference: 0 } },
      ignore: [],
    });
  });

  it('saves automatic as an empty selector and resolves null on cancel', async () => {
    const a = open();
    const choice = a.$<HTMLSelectElement>('select.choice');
    choice.value = 'auto';
    choice.dispatchEvent(new Event('change'));
    expect(a.$<HTMLInputElement>('input').value).toBe('');
    expect(a.$('.opens').textContent).toBe('Automatic: opens https://x.example/alice/status/1');
    a.$<HTMLButtonElement>('.next').click();
    expect(await a.p).toEqual({
      links: { f: { link: { selector: { type: 'css', value: '' } }, reference: 0 } },
      ignore: [],
    });

    const b = open();
    b.$<HTMLButtonElement>('.cancel').click();
    expect(await b.p).toBeNull();
  });

  it('unticks query parameters for the whole site, or keeps a feed’s own choice', async () => {
    document.body.innerHTML = `<main>${['a', 'b']
      .map(
        (v) =>
          `<article><a href="/u/${v}">u</a><h3><a href="/watch?pp=z&v=${v}&t=1">${v}</a></h3></article>`,
      )
      .join('')}</main>`;
    const items = [...document.querySelectorAll('article')];
    const selector = suggestPermalinks(items, BASE)[0]?.selector ?? {
      type: 'css' as const,
      value: '',
    };
    const p = chooseLinks(document, BASE, [{ descriptor: feed, items, reference: 0 }], ['t']);
    const root = document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    const box = (name: string) => $<HTMLInputElement>(`input[aria-label="Keep ${name}"]`);
    const own = () => $<HTMLInputElement>('label.own input');
    expect($('.params').textContent).toContain('on x.example');
    expect($('.params').textContent).toContain('v=adifferent in each post');
    expect(box('t').checked).toBe(false);
    expect(box('pp').checked).toBe(true);
    box('pp').checked = false;
    box('pp').dispatchEvent(new Event('change'));
    expect(box('pp').checked).toBe(false);
    expect(root.activeElement).toBe(box('pp'));
    expect($('.opens').textContent).toContain('Opens: https://x.example/watch?v=a ');

    // Another link has none of these params, but the site's choice stays.
    const choice = $<HTMLSelectElement>('select.choice');
    const other = [...choice.options].findIndex((o) => o.text.startsWith('/u/a'));
    choice.value = String(other);
    choice.dispatchEvent(new Event('change'));
    expect(box('pp').checked).toBe(false);
    expect($('.params').textContent).toContain('not in these posts');
    choice.value = '0';
    choice.dispatchEvent(new Event('change'));
    expect(box('pp').checked).toBe(false);

    own().checked = true;
    own().dispatchEvent(new Event('change'));
    expect($('.params').textContent).toContain('in this feed');
    box('t').checked = true;
    box('t').dispatchEvent(new Event('change'));
    expect($('.opens').textContent).toContain('Opens: https://x.example/watch?t=1&v=a ');
    $<HTMLButtonElement>('.next').click();
    expect(await p).toEqual({
      links: { f: { link: { selector, params: ['t', 'v'] }, reference: 0 } },
      ignore: ['pp', 't'],
    });
  });

  it('steps through sample posts; suggestions follow until a link is picked', async () => {
    const post = (id: string) =>
      `<article><a href="/u">u</a><a href="/u/status/${id}"><time>3h</time></a><p>Post ${id}</p></article>`;
    document.body.innerHTML = `<main><article><a href="https://ads.test/buy">Buy now</a></article>${post('1')}${post('2')}</main>`;
    const items = [...document.querySelectorAll('article')];
    const p = chooseLinks(document, BASE, [{ descriptor: feed, items, reference: 0 }]);
    const root = document.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    expect($('.which').textContent).toBe('1 of 3');
    expect($('.excerpt').textContent).toBe('Buy now');
    expect($<HTMLButtonElement>('.prev-post').disabled).toBe(true);
    expect($('.opens').textContent).toBe('Opens: https://ads.test/buy (found in 2 of 2 posts)');
    expect(root.querySelectorAll('.hl.sample').length).toBe(1);

    $<HTMLButtonElement>('.next-post').click();
    expect($('.which').textContent).toBe('2 of 3');
    expect($('.opens').textContent).toBe(
      'Opens: https://x.example/u/status/1 (found in 2 of 3 posts)',
    );
    // Once the user picks a link, stepping keeps it.
    const choice = $<HTMLSelectElement>('select.choice');
    choice.value = 'auto';
    choice.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('.next-post').click();
    expect($('.which').textContent).toBe('3 of 3');
    expect($<HTMLButtonElement>('.next-post').disabled).toBe(true);
    expect(choice.value).toBe('auto');
    $<HTMLButtonElement>('.next').click();
    expect(await p).toEqual({
      links: { f: { link: { selector: { type: 'css', value: '' } }, reference: 2 } },
      ignore: [],
    });
    expect(document.querySelector('[data-ghostify-chooser]')).toBeNull();
  });

  it('starts from a saved link', async () => {
    const doc = page();
    const items = [...doc.querySelectorAll('article')];
    const saved = { selector: { type: 'css' as const, value: 'a[role="link"]' } };
    const p = chooseLinks(doc, BASE, [{ descriptor: feed, items, reference: 1, link: saved }]);
    const root = doc.querySelector('[data-ghostify-chooser]')?.shadowRoot as ShadowRoot;
    expect(root.querySelector('.which')?.textContent).toBe('2 of 2');
    expect(root.querySelector('.opens')?.textContent).toBe(
      'Opens: https://x.example/bob (found in 2 of 2 posts)',
    );
    (root.querySelector('.next') as HTMLButtonElement).click();
    expect(await p).toEqual({ links: { f: { link: saved, reference: 1 } }, ignore: [] });
  });
});
