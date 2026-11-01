import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('test setup', () => {
  it('provides a fake browser and IndexedDB', async () => {
    await fakeBrowser.storage.local.set({ a: 1 });
    expect(await fakeBrowser.storage.local.get('a')).toEqual({ a: 1 });
    expect(typeof indexedDB.open).toBe('function');
  });
});
