import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { Dashboard } from '@/src/ui/Dashboard';

const draft = (id: string, extra = {}) => ({
  id,
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  title: `Post ${id}`,
  excerpt: `About ${id}`,
  url: `https://dev.to/x/${id}`,
  ...extra,
});

beforeEach(() => db.items.clear());
afterEach(cleanup);

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));

describe('dashboard', () => {
  it('shows tabs with counts and moves items between them', async () => {
    await ghostify(draft('a'), 1);
    await ghostify(draft('b'), 2);
    render(<Dashboard />);
    await screen.findByText('Post b');
    await vi.waitFor(() => expect(tab(/Ghosted/).textContent).toContain('2'));

    const card = screen.getByText('Post a').closest('article') as HTMLElement;
    await click(within(card).getByLabelText('Read later'));
    await vi.waitFor(() => expect(screen.queryByText('Post a')).toBeNull());
    await vi.waitFor(() => expect(tab(/Later/).textContent).toContain('1'));

    await click(tab(/Later/));
    await screen.findByText('Post a');
    await click(screen.getByLabelText('Back to Ghosted'));
    await vi.waitFor(() => expect(screen.getByText('Nothing saved for later')).toBeTruthy());
  });

  it('unghosts from the list', async () => {
    await ghostify(draft('a'));
    render(<Dashboard />);
    await screen.findByText('Post a');
    await click(screen.getByLabelText(/Unghost/));
    await screen.findByText('No ghosts here');
  });
});

describe('dashboard snooze', () => {
  it('snoozes an item and shows it back from snooze', async () => {
    await ghostify(draft('a'));
    render(<Dashboard />);
    await screen.findByText('Post a');
    await click(screen.getByLabelText('Snooze'));
    await click(screen.getByRole('menuitem', { name: /Tomorrow/ }));
    await screen.findByText('No ghosts here');
    expect((await db.items.get('dev.to:a'))?.state).toBe('snoozed');
    cleanup();

    await db.items.update('dev.to:a', {
      state: 'ghost',
      snoozeUntil: undefined,
      returnedAt: Date.now(),
    });
    render(<Dashboard />);
    await screen.findByText('Back from snooze');
    expect(screen.getByText('Post a')).toBeTruthy();
    await click(screen.getByText('Dismiss'));
    await vi.waitFor(() => expect(screen.queryByText('Back from snooze')).toBeNull());
  });
});
