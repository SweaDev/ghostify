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

describe('dashboard search and detail', () => {
  it('filters by keywords and site, and opens details', async () => {
    await ghostify(draft('a', { title: 'Rust ownership explained', author: 'Ada' }), 1);
    await ghostify(draft('b', { title: 'CSS grid tricks', host: 'css.test' }), 2);
    render(<Dashboard />);
    await screen.findByText('CSS grid tricks');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'rust' } });
    await vi.waitFor(() => expect(screen.queryByText('CSS grid tricks')).toBeNull());
    expect(screen.getByText('Rust ownership explained')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
    await screen.findByText('CSS grid tricks');
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'css.test' } });
    await vi.waitFor(() => expect(screen.queryByText('Rust ownership explained')).toBeNull());

    await click(screen.getByLabelText('Show details'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Open original')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('dashboard tags', () => {
  it('shows summaries and filters by tag', async () => {
    const { updateItem } = await import('@/src/store/items');
    await ghostify(draft('a', { title: 'Rust' }), 1);
    await ghostify(draft('b', { title: 'CSS' }), 2);
    await updateItem('dev.to:a', { summary: 'All about Rust.', tags: ['rust', 'systems'] });
    await updateItem('dev.to:b', { tags: ['css'] });
    render(<Dashboard />);
    expect(await screen.findByText('All about Rust.')).toBeTruthy();
    await click(screen.getByRole('button', { name: '#rust' }));
    await vi.waitFor(() => expect(screen.queryByText('CSS')).toBeNull());
    await click(screen.getByLabelText('Remove tag filter rust'));
    await screen.findByText('CSS');
  });
});

describe('dashboard excerpt', () => {
  it('opens details from the excerpt', async () => {
    await ghostify(draft('a', { excerpt: 'Click me' }));
    render(<Dashboard />);
    await click(await screen.findByText('Click me'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
