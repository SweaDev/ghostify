import type { RuntimeApi } from '@/src/feed/api';
import { startFeedRuntime } from '@/src/feed/runtime';
import { DEVTO_SITE } from '@/src/sites/defaults';
import type { GhostDraft, GhostItem } from '@/src/store/db';
import { devtoDoc } from './devto-fixture';

function fakeApi(initial: string[] = []) {
  const ghosted = new Set(initial);
  const state = { ghostAll: false };
  const drafts: GhostDraft[] = [];
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
  };
  return { api, ghosted, drafts, state };
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
}

describe('feed runtime', () => {
  beforeEach(() => devtoDoc());

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
});
