import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { deleteSnapshot, listSnapshots } from '@/src/store/snapshots';
import { BackupSettings } from '@/src/ui/BackupSettings';

const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));

beforeEach(async () => {
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version: '1.8.0' } as never);
  await db.items.clear();
  for (const s of await listSnapshots()) await deleteSnapshot(s.id);
});
afterEach(cleanup);

describe('BackupSettings', () => {
  it('takes, restores and deletes snapshots', async () => {
    const draft = { host: 'dev.to', siteId: 'devto', view: 'any' as const, excerpt: '' };
    await ghostify({ ...draft, id: 'a', title: 'A' });
    window.confirm = () => true;
    render(<BackupSettings />);
    await click(screen.getByRole('button', { name: /Take snapshot/ }));
    await screen.findByText(/Taken by you · v1\.8\.0 · 1 items/);

    await ghostify({ ...draft, id: 'b', title: 'B' });
    await click(screen.getByRole('button', { name: 'Restore snapshot' }));
    await screen.findByText('Snapshot restored.');
    expect(await db.items.count()).toBe(1);
    await screen.findByText(/Before a restore · v1\.8\.0 · 2 items/);

    const [del] = screen.getAllByRole('button', { name: 'Delete snapshot' });
    await click(del as HTMLElement);
    await vi.waitFor(async () => expect(await listSnapshots()).toHaveLength(1));
  });
});
