import { checkDescriptor, type FeedDescriptor, suggestPermalinks } from 'feedgrab';
import {
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
    const auto = checkDescriptor(doc, feed, { baseUrl: BASE });
    expect(auto.items.map((i) => i.permalink)).toEqual([
      'https://x.example/alice/status/1',
      'https://x.example/bob/status/2',
    ]);
    const author = checkDescriptor(
      doc,
      withPostLink(feed, { selector: { type: 'css', value: 'a[role="link"]' } }),
      { baseUrl: BASE },
    );
    expect(author.items[0]?.permalink).toBe('https://x.example/alice');
    expect(author.withLink).toBe(2);
    const none = checkDescriptor(
      doc,
      withPostLink(feed, { selector: { type: 'css', value: '.nope' } }),
      { baseUrl: BASE },
    );
    expect(none.withLink).toBe(0);
    expect(none.items[0]?.permalink).toBe('https://x.example/alice/status/1');
    expect(
      checkDescriptor(doc, { ...feed, item: { type: 'css', value: 'a[' } }, { baseUrl: BASE })
        .items,
    ).toEqual([]);
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
    const all = checkDescriptor(document, feed, { baseUrl: BASE });
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
    expect(checkDescriptor(document, d, { baseUrl: BASE }).items.map((i) => i.permalink)).toEqual([
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
    expect(
      checkDescriptor(document, site, { baseUrl: BASE }).items.map((i) => i.permalink),
    ).toEqual([
      'https://x.example/watch?v=a',
      'https://x.example/watch?v=b',
      'https://x.example/watch?v=c',
    ]);
  });
});
