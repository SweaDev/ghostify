import { cleanDraft, guard, isContentScript, safeUrl } from '@/src/background/guard';
import { parseSitesJson } from '@/src/sites/io';

const EXT = 'chrome-extension://abc/';
const page = { url: 'https://dev.to/latest', tab: { id: 1 } };
const draft = {
  id: 'a',
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  title: 'A',
  excerpt: 'x',
};

describe('sender guard', () => {
  it('tells content scripts from extension pages', () => {
    expect(isContentScript(page, EXT)).toBe(true);
    expect(isContentScript({ url: `${EXT}dashboard.html`, tab: { id: 2 } }, EXT)).toBe(false);
    expect(isContentScript({ url: `${EXT}popup.html` }, EXT)).toBe(false);
  });

  it('lets extension pages send anything', () => {
    expect(guard('listItems', {}, { url: `${EXT}dashboard.html` }, EXT)).toEqual({});
  });

  it('limits content scripts to feed messages for their own host', () => {
    expect(() => guard('listItems', {}, page, EXT)).toThrow(/not allowed/);
    expect(() => guard('addSite', { tabId: 3 }, page, EXT)).toThrow(/not allowed/);
    expect(() => guard('ghostify', { ...draft, host: 'evil.com' }, page, EXT)).toThrow(/host/);
    expect(() => guard('isGhosted', { host: 'x.com', ids: [] }, page, EXT)).toThrow(/host/);
    expect(() => guard('unghost', { key: 'x.com:a' }, page, EXT)).toThrow(/host/);
    expect(guard('unghost', { key: 'dev.to:a' }, page, EXT)).toEqual({ key: 'dev.to:a' });
    const ids = Array.from({ length: 900 }, (_, i) => `${i}`);
    expect(guard('isGhosted', { host: 'dev.to', ids }, page, EXT).ids).toHaveLength(500);
    expect(guard('ghostify', draft, page, EXT).title).toBe('A');
  });
});

describe('draft cleaning', () => {
  it('keeps only http(s) links and clamps text', () => {
    const d = cleanDraft({
      ...draft,
      url: 'javascript:alert(1)',
      image: 'https://img/x.png',
      title: 't'.repeat(1000),
      excerpt: 'e'.repeat(5000),
    });
    expect(d.url).toBeUndefined();
    expect(d.image).toBe('https://img/x.png');
    expect(d.title).toHaveLength(300);
    expect(d.excerpt).toHaveLength(2000);
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(
      cleanDraft({ ...draft, auto: { ruleId: 'r', criteria: 'c', confidence: 7 } }).auto,
    ).toEqual({ ruleId: 'r', criteria: 'c', confidence: 1 });
    expect(cleanDraft({ ...draft, feedId: 'f'.repeat(500) }).feedId).toHaveLength(200);
    expect('feedId' in cleanDraft(draft)).toBe(false);
  });
});

describe('site import validation', () => {
  const site = (patch: object) =>
    JSON.stringify([{ id: 's', hostname: 'example.com', label: 'E', profiles: [], ...patch }]);
  it('rejects odd hostnames and malformed rules', () => {
    expect(() => parseSitesJson(site({ hostname: '*' }))).toThrow(/hostname/);
    expect(() => parseSitesJson(site({ hostname: 'a.com/x' }))).toThrow(/hostname/);
    expect(() => parseSitesJson(site({ rules: [{ id: 'r', criteria: 3 }] }))).toThrow(/criteria/);
    expect(parseSitesJson(site({ rules: [{ id: 'r', criteria: ' x ' }] }))[0]?.rules).toEqual([
      { id: 'r', criteria: 'x', enabled: true },
    ]);
  });

  it('validates and cleans the ignored query parameters', () => {
    expect(() => parseSitesJson(site({ ignoreParams: 'pp' }))).toThrow(/ignoreParams/);
    expect(() => parseSitesJson(site({ ignoreParams: [1] }))).toThrow(/ignoreParams/);
    expect(
      parseSitesJson(site({ ignoreParams: [' si', 'pp', 'a&b', 'pp'] }))[0]?.ignoreParams,
    ).toEqual(['pp', 'si']);
    expect('ignoreParams' in (parseSitesJson(site({ ignoreParams: [] }))[0] ?? {})).toBe(false);
  });
});
