import { GrabSession, type SessionDeps } from '@/src/grab/session';
import type { Site } from '@/src/sites/model';

const card = (i: number) => `
  <div class="video-card">
    <a class="thumb" href="https://www.youtube.com/watch?v=vid${i}abcdEF&amp;pp=x${i}"><img src="https://i.test/${i}.jpg" width="320" height="180"><span class="badge">${i + 1}:0${i}</span></a>
    <h3 class="video-title"><a href="https://www.youtube.com/watch?v=vid${i}abcdEF">Video number ${i} about harbors</a></h3>
    <a class="channel-name" href="/@c${i}">Channel ${i}</a>
    <span class="views">${i}K views</span>
  </div>`;

function page() {
  document.title = 'Tube Home - Tube';
  document.body.innerHTML = `<header><a href="/">Tube</a><nav><a href="/a">A</a><a href="/b">B</a></nav></header>
    <main><section class="grid">${[0, 1, 2, 3, 4, 5].map(card).join('')}</section></main>`;
}

function fakes(over: Partial<SessionDeps> = {}) {
  const saved: Site[] = [];
  const samples: string[] = [];
  const closed: string[] = [];
  let sites: Site[] = [];
  const deps: SessionDeps = {
    doc: document,
    url: 'https://tube.test/',
    getSites: async () => sites,
    saveSite: async (s) => {
      saved.push(s);
      sites = [s];
    },
    saveSample: async (s) => {
      samples.push(s.feedId);
    },
    pick: async () => {
      throw new Error('no pick');
    },
    cancelPick: () => {},
    highlight: () => {},
    scrollTo: () => {},
    dock: { side: 'right', size: 400 },
    saveDock: () => {},
    popOut: () => {},
    close: (r) => {
      closed.push(r);
    },
    ...over,
  };
  return { deps, saved, samples, closed };
}

beforeEach(page);

describe('grab session', () => {
  it('finds the feed with its content type and pre-ticks the best one', async () => {
    const { deps } = fakes();
    const s = new GrabSession(deps);
    await s.init();
    const [first] = s.state.feeds;
    expect(first).toMatchObject({ accepted: true, items: 6, type: 'video' });
    expect(s.state.selected).toBe(first?.id);
    expect(s.state.editing).toBe(false);
  });

  it('describes the sample item and its attributes on the content step', async () => {
    const { deps } = fakes();
    const s = new GrabSession(deps);
    await s.init();
    await s.run({ type: 'step', step: 'content' });
    const c = s.state.content;
    expect(c).toMatchObject({
      type: 'video',
      detected: 'video',
      declared: false,
      items: 6,
      reference: 0,
    });
    expect(c?.preview).toMatchObject({
      kind: 'video',
      title: 'Video number 0 about harbors',
      provider: 'youtube',
    });
    const by = Object.fromEntries((c?.fields ?? []).map((f) => [f.field, f]));
    expect(by.embedUrl?.value).toBe('https://www.youtube-nocookie.com/embed/vid0abcdEF');
    expect(by.duration).toMatchObject({ value: '60', coverage: 1 });
    expect(c?.link.params.map((p) => p.name)).toEqual(['v']);
    await s.run({ type: 'reference', index: 2 });
    expect(s.state.content?.preview?.title).toBe('Video number 2 about harbors');
  });

  it('turns a picked element into a field rule, and sets the content type', async () => {
    const author = () => document.querySelectorAll('.channel-name')[0] as Element;
    const { deps } = fakes({
      pick: async (filter) => (filter(author()) ? author() : Promise.reject()),
    });
    const s = new GrabSession(deps);
    await s.init();
    await s.run({ type: 'step', step: 'content' });
    await s.run({ type: 'pickField', field: 'author' });
    const row = s.state.content?.fields.find((f) => f.field === 'author');
    expect(row).toMatchObject({ value: 'Channel 0', coverage: 1 });
    expect(row?.rule?.selector.value).toBeTruthy();
    await s.run({ type: 'setType', contentType: 'post' });
    expect(s.state.content).toMatchObject({ type: 'post', declared: true, detected: 'video' });
    await s.run({ type: 'setField', field: 'author', rule: null });
    expect(s.state.content?.fields.find((f) => f.field === 'author')?.rule).toBeUndefined();
  });

  it('keeps or ignores query parameters for the site or one feed', async () => {
    const { deps } = fakes();
    const s = new GrabSession(deps);
    await s.init();
    await s.run({ type: 'step', step: 'content' });
    await s.run({ type: 'setParam', name: 'v', kept: false });
    expect(s.state.ignore).toEqual(['v']);
    expect(s.state.content?.link.params.find((p) => p.name === 'v')?.kept).toBe(false);
    await s.run({ type: 'setParam', name: 'v', kept: true });
    await s.run({ type: 'ownParams', own: true });
    expect(s.state.content?.link.own).toBe(true);
    expect(s.state.content?.link.params.find((p) => p.name === 'v')?.kept).toBe(true);
  });

  it('refuses to go on without a ticked feed, and reports errors as state', async () => {
    const { deps } = fakes();
    const s = new GrabSession(deps);
    await s.init();
    for (const f of s.state.feeds) if (f.accepted) await s.run({ type: 'toggle', id: f.id });
    await s.run({ type: 'step', step: 'content' });
    expect(s.state.error).toMatch(/Tick at least one feed/);
    expect(s.state.step).toBe('feeds');
  });

  it('saves the page profile with content rules, view and samples, then closes', async () => {
    const { deps, saved, samples, closed } = fakes();
    const s = new GrabSession(deps);
    await s.init();
    await s.run({ type: 'step', step: 'content' });
    await s.run({ type: 'setType', contentType: 'video' });
    await s.run({ type: 'step', step: 'save' });
    await s.run({ type: 'setPath', pattern: '/' });
    await s.run({ type: 'setView', view: 'loggedOut' });
    await s.run({ type: 'save', thumbnails: false });
    expect(closed).toEqual(['saved']);
    const site = saved[0];
    expect(site).toMatchObject({ hostname: 'tube.test', label: 'Tube' });
    const entry = site?.profiles[0];
    expect(entry?.view).toBe('loggedOut');
    expect(entry?.profile.pathPattern).toBe('/');
    expect(entry?.profile.feeds[0]?.content?.type).toBe('video');
    expect(entry?.profile.feeds[0]?.confirmed).toBe(true);
    expect(samples).toHaveLength(1);
    expect(s.state.imageOrigins).toEqual(['https://i.test/*']);
  });

  it('edits an existing site: its feeds come back ticked and the view is kept', async () => {
    const first = fakes();
    const a = new GrabSession(first.deps);
    await a.init();
    await a.run({ type: 'save', thumbnails: false });
    const again = fakes({ getSites: async () => first.saved });
    const b = new GrabSession(again.deps);
    await b.init();
    expect(b.state.editing).toBe(true);
    expect(b.state.feeds.filter((f) => f.accepted)).toHaveLength(1);
  });

  it('remembers dock side and size, pops out and cancels', async () => {
    const prefs: unknown[] = [];
    const popped: boolean[] = [];
    const { deps, closed } = fakes({
      saveDock: (p) => prefs.push(p),
      popOut: () => popped.push(true),
    });
    const s = new GrabSession(deps);
    await s.init();
    await s.run({ type: 'dock', side: 'bottom' });
    await s.run({ type: 'resize', size: 333.4 });
    expect(prefs).toEqual([
      { side: 'bottom', size: 400 },
      { side: 'bottom', size: 333 },
    ]);
    await s.run({ type: 'popOut' });
    expect(popped).toEqual([true]);
    expect(s.state.dock.mode).toBe('window');
    await s.run({ type: 'cancel' });
    expect(closed).toEqual(['cancelled']);
  });
});
