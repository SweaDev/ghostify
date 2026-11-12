import { permalinkId } from 'feedgrab';
import type { RuntimeApi } from '@/src/feed/api';
import { setPicking } from '@/src/feed/reveal';
import { STRUCTURE_CHECK_MS, startFeedRuntime } from '@/src/feed/runtime';
import { DEVTO_SITE } from '@/src/sites/defaults';
import type { GhostDraft, GhostItem } from '@/src/store/db';
import { devtoDoc } from './devto-fixture';

function fakeApi(initial: string[] = []) {
  const ghosted = new Set(initial);
  const state = { ghostAll: false };
  const drafts: GhostDraft[] = [];
  const autos: GhostDraft[] = [];
  const kept = new Set<string>();
  const api: RuntimeApi = {
    isGhosted: async (_host, ids) => ids.filter((id) => state.ghostAll || ghosted.has(id)),
    ghostify: async (d) => {
      ghosted.add(d.id);
      drafts.push(d);
      return {
        ...d,
        key: `${d.host}:${d.id}`,
        state: 'ghost',
        createdAt: 0,
        updatedAt: 0,
      } as GhostItem;
    },
    unghost: vi.fn(async (key: string) => {
      ghosted.delete(key.split(':')[1] as string);
    }),
    autoGhostify: async (d) => {
      if (kept.has(d.id)) return null;
      autos.push(d);
      ghosted.add(d.id);
      return {
        ...d,
        key: `${d.host}:${d.id}`,
        state: 'ghost',
        createdAt: 0,
        updatedAt: 0,
      } as GhostItem;
    },
  };
  return { api, ghosted, drafts, state, autos, kept };
}

const stories = () => [...document.querySelectorAll<HTMLElement>('#substories > .crayons-story')];
const isHidden = (el: Element) => getComputedStyle(el).display === 'none';
const button = () =>
  document.querySelector('[data-ghostify]')?.shadowRoot?.querySelector('.btn') as HTMLButtonElement;
const start = (api: RuntimeApi, url = 'https://dev.to/') =>
  startFeedRuntime({ doc: document, url, sites: [DEVTO_SITE], api });

/** The feedgrab id the runtime uses for an element, found by ghostifying through the button. */
async function ghostViaButton(el: Element) {
  el.querySelector('h2')?.dispatchEvent(new Event('pointerover', { bubbles: true }));
  button().click();
  // Wait out the mist-and-lift animation before the next interaction.
  await vi.waitFor(() => expect(button().classList.contains('poof')).toBe(false));
}

describe('feed runtime', () => {
  beforeEach(() => devtoDoc());
  afterEach(() => setPicking(document, false));

  it('is inactive on pages without a profile', () => {
    expect(start(fakeApi().api, 'https://dev.to/someone/post-1').active).toBe(false);
  });

  it('ghostifies via the button, hides the item and undoes', async () => {
    const { api, drafts } = fakeApi();
    const rt = start(api);
    expect(rt.active).toBe(true);
    await vi.waitFor(() => expect(stories().length).toBe(3));
    const [first] = stories() as [HTMLElement];
    await vi.waitFor(async () => {
      await ghostViaButton(first);
      expect(drafts).toHaveLength(1);
    });
    expect(drafts[0]).toMatchObject({ host: 'dev.to', siteId: 'devto', view: 'loggedOut' });
    expect(drafts[0]?.url).toMatch(/^https:\/\/dev\.to\//);
    await vi.waitFor(() => expect(isHidden(first)).toBe(true));
    const undo = document
      .querySelector('[data-ghostify]')
      ?.shadowRoot?.querySelector('.toast button') as HTMLButtonElement;
    undo.click();
    expect(isHidden(first)).toBe(false);
    expect(api.unghost).toHaveBeenCalledWith(`dev.to:${drafts[0]?.id}`);
    rt.dispose();
    expect(document.querySelector('[data-ghostify]')).toBeNull();
  });

  it('drops the site’s ignored query parameters from post links and saves the feed id', async () => {
    for (const a of stories()[0]?.querySelectorAll('a') ?? [])
      if (a.href.startsWith('https://dev.to/')) a.href = `${a.href}?pp=x&q=1`;
    const { api, drafts } = fakeApi();
    const rt = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [{ ...DEVTO_SITE, ignoreParams: ['pp'] }],
      api,
    });
    await vi.waitFor(async () => {
      await ghostViaButton(stories()[0] as HTMLElement);
      expect(drafts).toHaveLength(1);
    });
    expect(drafts[0]?.url).toMatch(/\?q=1$/);
    expect(drafts[0]?.id).toBe(permalinkId(drafts[0]?.url ?? ''));
    expect(drafts[0]?.feedId).toBe(DEVTO_SITE.profiles[0]?.profile.feeds[0]?.id);
    rt.dispose();
  });

  it('tracks stories that infinite scroll appends inside nested paged-stories wrappers', async () => {
    const { api, drafts } = fakeApi();
    const rt = start(api);
    // dev.to appends each new page inside the previous page's wrapper.
    let parent = document.querySelector('#substories') as Element;
    let story: HTMLElement | undefined;
    for (let depth = 1; depth <= 3; depth++) {
      const page = document.createElement('div');
      page.className = 'paged-stories';
      story = document.createElement('article');
      story.className = 'crayons-story';
      story.innerHTML = (stories()[2] as HTMLElement).innerHTML;
      for (const a of story.querySelectorAll('a'))
        a.href = `https://dev.to/someone/paged-post-${depth}`;
      page.append(story);
      parent.append(page);
      parent = page;
    }
    if (!story) throw new Error('no story');
    await vi.waitFor(async () => {
      await ghostViaButton(story);
      expect(drafts).toHaveLength(1);
    });
    expect(drafts[0]?.url).toBe('https://dev.to/someone/paged-post-3');
    await vi.waitFor(() => expect(isHidden(story)).toBe(true));
    rt.dispose();
  });

  it('hides already-ghosted items on load and when new ones are added', async () => {
    // Learn the ids of the stories from a first run.
    const first = fakeApi();
    const rt1 = start(first.api);
    for (const s of stories()) {
      await vi.waitFor(async () => {
        const n = first.drafts.length;
        await ghostViaButton(s);
        expect(first.drafts.length).toBe(n + 1);
      });
    }
    rt1.dispose();
    const ids = first.drafts.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);

    devtoDoc();
    const second = fakeApi([ids[0] as string]);
    const rt2 = start(second.api);
    await vi.waitFor(() => expect(isHidden(stories()[0] as Element)).toBe(true));
    expect(isHidden(stories()[1] as Element)).toBe(false);

    // Re-render: a story ghosted elsewhere re-mounts as a new node.
    const clone = stories()[1]?.cloneNode(true) as HTMLElement;
    stories()[1]?.remove();
    second.ghosted.add(ids[1] as string);
    document.querySelector('#substories')?.append(clone);
    await vi.waitFor(() => expect(isHidden(clone)).toBe(true));

    // Infinite scroll: a brand-new story that is ghosted gets hidden too.
    const fresh = stories()[2]?.cloneNode(true) as HTMLElement;
    for (const a of fresh.querySelectorAll('a')) a.href = 'https://dev.to/someone/new-post-123';
    second.state.ghostAll = true;
    document.querySelector('#substories')?.append(fresh);
    await vi.waitFor(() => expect(isHidden(fresh)).toBe(true));
    rt2.dispose();
  });

  it('shows ghostified items under a labelled veil while the picker runs', async () => {
    const { api, state } = fakeApi();
    state.ghostAll = true;
    const rt = start(api);
    await vi.waitFor(() => expect(stories().every(isHidden)).toBe(true));
    const veil = () =>
      document.querySelector('[data-ghostify-veil]')?.shadowRoot?.querySelectorAll('.hl.ghost');

    setPicking(document, true);
    expect(stories().some(isHidden)).toBe(false);
    expect(veil()?.length).toBeGreaterThanOrEqual(stories().length);
    expect(veil()?.[0]?.textContent).toBe('Ghostified');
    stories()[0]
      ?.querySelector('h2')
      ?.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(button().classList.contains('on')).toBe(false);

    setPicking(document, false);
    expect(stories().every(isHidden)).toBe(true);
    expect(document.querySelector('[data-ghostify-veil]')).toBeNull();
    rt.dispose();
  });

  it('starts veiled when the picker is already open', async () => {
    const { api, state } = fakeApi();
    state.ghostAll = true;
    setPicking(document, true);
    const rt = start(api);
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-ghostify-veil]')?.shadowRoot?.querySelectorAll('.hl.ghost')
          .length,
      ).toBeGreaterThanOrEqual(stories().length),
    );
    expect(stories().some(isHidden)).toBe(false);
    setPicking(document, false);
    expect(stories().every(isHidden)).toBe(true);
    rt.dispose();
  });

  it('asks for a reload when the extension context is invalidated', async () => {
    const { api } = fakeApi();
    api.ghostify = async () => {
      throw new Error('Extension context invalidated.');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rt = start(api);
    const [first] = stories() as [HTMLElement];
    const toast = () =>
      document.querySelector('[data-ghostify]')?.shadowRoot?.querySelector('.toast');
    await vi.waitFor(async () => {
      await ghostViaButton(first);
      expect(toast()?.textContent).toMatch(/Reload this page/);
    });
    expect(isHidden(first)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    first.querySelector('h2')?.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(button().classList.contains('on')).toBe(false);
    warn.mockRestore();
    rt.dispose();
  });

  it('hides the button and asks for a reload once the extension is gone', async () => {
    let alive = true;
    const rt = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [DEVTO_SITE],
      api: fakeApi().api,
      alive: () => alive,
    });
    const h2 = (stories()[0] as HTMLElement).querySelector('h2') as Element;
    const over = () => h2.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.waitFor(() => {
      over();
      expect(button().classList.contains('on')).toBe(true);
    });
    alive = false;
    over();
    expect(button().classList.contains('on')).toBe(false);
    const root = document.querySelector('[data-ghostify]')?.shadowRoot;
    expect(root?.querySelector('.toast')?.textContent).toMatch(/Reload this page/);
    rt.dispose();
  });
});

describe('post structure', () => {
  beforeEach(() => devtoDoc());
  afterEach(() => vi.useRealTimers());

  /** dev.to with every feed requiring `css`. */
  const shaped = (css: string) => ({
    ...DEVTO_SITE,
    profiles: DEVTO_SITE.profiles.map((e) => ({
      ...e,
      profile: {
        ...e.profile,
        feeds: e.profile.feeds.map((f) => ({
          ...f,
          structure: {
            parts: [{ selector: { type: 'css' as const, value: css }, required: true }],
          },
        })),
      },
    })),
  });
  const run = (site = shaped('h2.ok')) =>
    startFeedRuntime({ doc: document, url: 'https://dev.to/', sites: [site], api: fakeApi().api });
  const toast = () =>
    document.querySelector('[data-ghostify]')?.shadowRoot?.querySelector('.toast')?.textContent;

  it('offers the button only on items with every required part', async () => {
    const [ad, post] = stories() as [HTMLElement, HTMLElement];
    for (const s of stories().slice(1)) s.querySelector('h2')?.classList.add('ok');
    const rt = run();
    const over = (el: HTMLElement) =>
      el.querySelector('h2')?.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.waitFor(() => {
      over(post);
      expect(button().classList.contains('on')).toBe(true);
    });
    over(ad);
    expect(button().classList.contains('on')).toBe(false);
    rt.dispose();
  });

  it('warns once when no item has the saved structure', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const rt = run(shaped('.nope'));
    vi.advanceTimersByTime(STRUCTURE_CHECK_MS);
    expect(toast()).toMatch(/no post here has every required part/);
    rt.dispose();

    const ok = run(shaped('h2'));
    vi.advanceTimersByTime(STRUCTURE_CHECK_MS);
    expect(toast()).toBeUndefined();
    ok.dispose();
  });
});

describe('login views', () => {
  const loggedOutOnly = {
    ...DEVTO_SITE,
    profiles: DEVTO_SITE.profiles.filter((e) => e.view === 'loggedOut'),
  };
  const setLoggedIn = (on: boolean) => {
    if (!on) return document.querySelector('#nav-profile-image')?.remove();
    const img = document.createElement('img');
    img.id = 'nav-profile-image';
    document.body.prepend(img);
  };

  it('picks the profile for the current view and reports view changes', async () => {
    devtoDoc();
    const onViewChange = vi.fn();
    const rt = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [loggedOutOnly],
      api: fakeApi().api,
      onViewChange,
    });
    expect(rt.active).toBe(true);
    setLoggedIn(true);
    await vi.waitFor(() => expect(onViewChange).toHaveBeenCalledTimes(1));
    rt.dispose();

    // Logged in without a logged-in profile: inactive, but still watches for a change back.
    const onBack = vi.fn();
    const rt2 = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [loggedOutOnly],
      api: fakeApi().api,
      onViewChange: onBack,
    });
    expect(rt2.active).toBe(false);
    setLoggedIn(false);
    await vi.waitFor(() => expect(onBack).toHaveBeenCalled());
    rt2.dispose();
  });

  it('tracks logged-in dev.to articles, including nested paged-stories', async () => {
    const template = (devtoDoc().querySelector('#substories > .crayons-story') as HTMLElement)
      .innerHTML;
    document.body.innerHTML = '<div id="rendered-article-feed"></div>';
    setLoggedIn(true);
    let parent = document.querySelector('#rendered-article-feed') as Element;
    let story: HTMLElement | undefined;
    for (let depth = 0; depth <= 2; depth++) {
      story = document.createElement('article');
      story.className = 'crayons-story';
      story.innerHTML = template;
      for (const a of story.querySelectorAll('a')) a.href = `https://dev.to/me/in-post-${depth}`;
      parent.append(story);
      const page = document.createElement('div');
      page.className = 'paged-stories';
      parent.append(page);
      parent = page;
    }
    if (!story) throw new Error('no story');
    const { api, drafts } = fakeApi();
    const rt = start(api);
    expect(rt.active).toBe(true);
    await vi.waitFor(async () => {
      await ghostViaButton(story);
      expect(drafts).toHaveLength(1);
    });
    expect(drafts[0]).toMatchObject({ url: 'https://dev.to/me/in-post-2', view: 'loggedIn' });
    rt.dispose();
  });
});

describe('auto-ghostify rules', () => {
  const rules = [{ id: 'r1', criteria: 'posts about JavaScript', enabled: true }];
  const site = { ...DEVTO_SITE, rules };
  /** Fake decision backend: JavaScript stories match the first criterion. */
  const llm = vi.fn(async (req: { task: string; items?: { id: string; text: string }[] }) => ({
    results: (req.items ?? []).map((i) =>
      /javascript/i.test(i.text)
        ? { id: i.id, exclude: true, criteriaIndex: 0, confidence: 0.9 }
        : { id: i.id, exclude: false, confidence: 0.9 },
    ),
  }));
  const jsStory = () =>
    stories().find((s) => /javascript/i.test(s.textContent ?? '')) as HTMLElement;

  beforeEach(() => {
    devtoDoc();
    llm.mockClear();
  });

  it('auto-ghostifies matching items with the rule recorded', async () => {
    expect(jsStory()).toBeTruthy();
    const { api, autos } = fakeApi();
    const rt = startFeedRuntime({ doc: document, url: 'https://dev.to/', sites: [site], api, llm });
    await vi.waitFor(() => expect(autos.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(autos[0]?.auto).toEqual({
      ruleId: 'r1',
      criteria: 'posts about JavaScript',
      confidence: 0.9,
    });
    await vi.waitFor(() => expect(isHidden(jsStory())).toBe(true));
    const others = stories().filter((s) => !/javascript/i.test(s.textContent ?? ''));
    expect(others.some((s) => !isHidden(s))).toBe(true);
    rt.dispose();
  });

  it('keeps rescued items and ignores rules without an LLM', async () => {
    const first = fakeApi();
    const rt1 = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [site],
      api: first.api,
      llm,
    });
    await vi.waitFor(() => expect(first.autos.length).toBeGreaterThan(0), { timeout: 3000 });
    rt1.dispose();

    devtoDoc();
    const second = fakeApi();
    for (const a of first.autos) second.kept.add(a.id);
    const rt2 = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [site],
      api: second.api,
      llm,
    });
    await vi.waitFor(() => expect(llm).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(second.autos).toEqual([]);
    expect(isHidden(jsStory())).toBe(false);
    rt2.dispose();

    devtoDoc();
    llm.mockClear();
    const third = fakeApi();
    const rt3 = startFeedRuntime({
      doc: document,
      url: 'https://dev.to/',
      sites: [site],
      api: third.api,
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(llm).not.toHaveBeenCalled();
    expect(third.autos).toEqual([]);
    rt3.dispose();
  });
});
