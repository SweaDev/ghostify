import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handlers, registerHandlers } from '@/src/background/handlers';
import { sendMessage } from '@/src/messaging';
import { db } from '@/src/store/db';

const draft = {
  id: 'a',
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  title: 'A',
  excerpt: 'a',
};

beforeEach(() => db.items.clear());

describe('background handlers', () => {
  it('ghostify → isGhosted → setState → listItems → unghost', async () => {
    const item = await handlers.ghostify(draft);
    expect(await handlers.isGhosted({ host: 'dev.to', ids: ['a', 'b'] })).toEqual(['a']);
    expect((await handlers.setState({ key: item.key, state: 'later' })).state).toBe('later');
    expect((await handlers.listItems({ state: 'later' })).map((i) => i.key)).toEqual([item.key]);
    await handlers.unghost({ key: item.key });
    expect(await handlers.isGhosted({ host: 'dev.to', ids: ['a'] })).toEqual([]);
  });

  it('opens the dashboard in a new tab', async () => {
    await handlers.openDashboard(undefined);
    const tabs = await fakeBrowser.tabs.query({});
    expect(tabs.at(-1)?.url).toMatch(/dashboard\.html$/);
  });

  it('answers messages once registered', async () => {
    registerHandlers();
    await sendMessage('ghostify', draft);
    expect(await sendMessage('isGhosted', { host: 'dev.to', ids: ['a'] })).toEqual(['a']);
  });
});
