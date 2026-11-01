import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '@/entrypoints/popup/App';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { timeAgo } from '@/src/ui/format';

const draft = (id: string) => ({
  id,
  host: 'dev.to',
  siteId: 'devto',
  view: 'loggedOut' as const,
  title: `Post ${id}`,
  excerpt: '',
  url: `https://dev.to/x/${id}`,
});

beforeEach(() => db.items.clear());
afterEach(cleanup);

describe('popup', () => {
  it('shows an empty state', async () => {
    render(<App />);
    expect(await screen.findByText('Nothing ghosted yet')).toBeTruthy();
  });

  it('lists ghosted items newest first and unghosts', async () => {
    await ghostify(draft('a'), 1);
    await ghostify(draft('b'), 2);
    render(<App />);
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Post b', 'Post a']);
    expect(screen.getByText('2 ghosted')).toBeTruthy();
    const [unghostB] = screen.getAllByLabelText(/Unghost/);
    await act(async () => {
      fireEvent.click(unghostB as HTMLElement);
    });
    await vi.waitFor(() => expect(screen.queryByText('Post b')).toBeNull());
    expect(await db.items.count()).toBe(1);
  });
});

describe('timeAgo', () => {
  it('formats relative times', () => {
    expect(timeAgo(1000, 1000)).toBe('just now');
    expect(timeAgo(0, 2 * 3_600_000)).toBe('2 hours ago');
    expect(timeAgo(2 * 86_400_000, 0)).toBe('in 2 days');
  });
});
