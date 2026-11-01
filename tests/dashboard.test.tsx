import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { Dashboard } from '@/src/ui/Dashboard';
import { OLLAMA_AI } from './ollama-ai';

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
    await click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Post a')).toBeTruthy();
  });

  it('renders long lists a page at a time', async () => {
    for (let i = 0; i < 55; i++) await ghostify(draft(`p${i}`), i);
    render(<Dashboard />);
    await screen.findByText('Post p54');
    expect(screen.queryByText('Post p4')).toBeNull();
    await click(screen.getByRole('button', { name: /Show more \(5 left\)/ }));
    expect(screen.getByText('Post p4')).toBeTruthy();
  });

  it('keeps the viewer open when its item leaves the list', async () => {
    await ghostify(draft('a'));
    render(<Dashboard />);
    await click(await screen.findByRole('button', { name: 'Post a' }));
    const dialog = await screen.findByRole('dialog');
    await click(within(dialog).getByLabelText('Read later'));
    await screen.findByText('No ghosts here');
    expect(screen.getByRole('dialog')).toBeTruthy();
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
    expect(within(dialog).getByRole('button', { name: 'Read here' })).toBeTruthy();
    expect(within(dialog).getByLabelText('Open original in a new window')).toBeTruthy();
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

describe('dashboard semantic search', () => {
  it('ranks by meaning through the background when AI is on', async () => {
    const models = await import('@/src/ai/models');
    const { registerHandlers } = await import('@/src/background/handlers');
    const { afterGhostify } = await import('@/src/background/jobs');
    const { DEFAULT_SETTINGS, saveSettings, withDefaults } = await import('@/src/store/settings');
    const { embedModel, textModel } = await import('./mock-model');
    vi.spyOn(models, 'embeddingModel').mockReturnValue(
      embedModel((t) => [/rust|memory/i.test(t) ? 1 : 0, /css/i.test(t) ? 1 : 0, 0.1]),
    );
    vi.spyOn(models, 'languageModel').mockReturnValue(textModel('{"summary":"s","tags":[]}'));
    await saveSettings(
      withDefaults({ ai: { ...DEFAULT_SETTINGS.ai, ...OLLAMA_AI, enabled: true } }),
    );
    registerHandlers();
    for (const [id, title] of [
      ['a', 'Rust ownership'],
      ['b', 'CSS grid'],
    ]) {
      await afterGhostify((await ghostify(draft(id as string, { title }))).key);
    }
    render(<Dashboard />);
    await screen.findByText('CSS grid');
    await click(await screen.findByRole('button', { name: /Semantic/ }));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'memory safety' } });
    // The search box is debounced; wait for the ranked list (Rust only).
    await vi.waitFor(() => {
      expect(screen.queryByText('CSS grid')).toBeNull();
      expect(screen.getByText('Rust ownership')).toBeTruthy();
    });
    vi.restoreAllMocks();
  });
});

describe('dashboard auto items', () => {
  it('labels auto-ghosted items and rescues them', async () => {
    const { db: database } = await import('@/src/store/db');
    await ghostify(draft('a', { auto: { ruleId: 'r', criteria: 'crypto hype', confidence: 1 } }));
    render(<Dashboard />);
    expect(await screen.findByText('Auto-ghosted: crypto hype')).toBeTruthy();
    await click(screen.getByLabelText(/Not this/));
    await screen.findByText('No ghosts here');
    expect(await database.kept.get('dev.to:a')).toBeTruthy();
  });
});
