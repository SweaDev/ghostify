import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as models from '@/src/ai/models';
import { pauseAll, resumeAll, runJob, stopAll } from '@/src/background/ai-queue';
import { handlers } from '@/src/background/handlers';
import * as messaging from '@/src/messaging';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { getSettings, saveSettings, withDefaults } from '@/src/store/settings';
import { AiActivity } from '@/src/ui/AiActivity';
import { Dashboard } from '@/src/ui/Dashboard';
import { PromptSettings } from '@/src/ui/PromptSettings';
import { streamModel } from './mock-model';

const draft = {
  id: 'a',
  host: 'dev.to',
  siteId: 'devto',
  view: 'any' as const,
  title: 'Rust ownership',
  excerpt: 'Who owns what',
  url: 'https://dev.to/x/a',
};
const click = (el: HTMLElement) => act(async () => void fireEvent.click(el));
const aiOn = async () =>
  saveSettings(withDefaults({ ai: { ...(await getSettings()).ai, enabled: true } }));

beforeEach(async () => {
  await Promise.all([db.items.clear(), db.contents.clear(), db.aiJobs.clear()]);
  await stopAll();
  await resumeAll();
  // Pages talk to the background through messaging; call the handlers directly here.
  vi.spyOn(messaging, 'sendMessage').mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: test bridge over the typed protocol
    (async (type: keyof typeof handlers, data: any) => (handlers[type] as any)(data)) as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe('viewer', () => {
  it('shows the grabbed content in the reader tab', async () => {
    await ghostify(draft);
    await db.contents.put({
      key: 'dev.to:a',
      url: draft.url,
      title: 'Rust ownership, in full',
      html: '<p>Every value has an owner.</p>',
      text: 'Every value has an owner.',
      fetchedAt: Date.now(),
    });
    render(<Dashboard />);
    await click(await screen.findByRole('button', { name: 'Rust ownership' }));
    const dialog = await screen.findByRole('dialog');
    await click(within(dialog).getByRole('tab', { name: /Reader/ }));
    expect(await within(dialog).findByText('Every value has an owner.')).toBeTruthy();
    expect(within(dialog).getByText('Rust ownership, in full')).toBeTruthy();
  });

  it('asks to turn on AI, then summarizes and answers questions', async () => {
    await ghostify({ ...draft, url: undefined });
    render(<Dashboard />);
    await click(await screen.findByRole('button', { name: 'Rust ownership' }));
    await click(screen.getByRole('tab', { name: /Ask AI/ }));
    expect(screen.getByRole('button', { name: 'Open AI settings' })).toBeTruthy();
    cleanup();

    await aiOn();
    vi.spyOn(models, 'languageModel').mockReturnValue(streamModel(['Owners ', 'free memory.']));
    render(<Dashboard />);
    await click(await screen.findByRole('button', { name: 'Rust ownership' }));
    await click(screen.getByRole('tab', { name: /Ask AI/ }));
    await click(screen.getByRole('button', { name: 'Summarize' }));
    expect(await screen.findByText('Owners free memory.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why?' } });
    await click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Why?')).toBeTruthy();
    await vi.waitFor(() => expect(screen.getAllByText('Owners free memory.')).toHaveLength(2));
  });

  it('opens one item as its own page', async () => {
    await ghostify(draft);
    history.replaceState(null, '', '#item=dev.to%3Aa&tab=ask');
    render(<Dashboard />);
    expect(await screen.findByRole('main', { name: 'Rust ownership' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Ask AI/ }).getAttribute('aria-selected')).toBe('true');
    await click(screen.getByLabelText('Back to Ghostify'));
    expect(await screen.findByRole('tab', { name: /Ghosted/ })).toBeTruthy();
  });

  it('opens the original in a new window', async () => {
    const create = vi.spyOn(fakeBrowser.windows, 'create').mockResolvedValue({} as never);
    await ghostify(draft);
    render(<Dashboard />);
    await click(await screen.findByRole('button', { name: 'Rust ownership' }));
    await click(screen.getByLabelText('Open original in a new window'));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ url: draft.url }));
  });
});

describe('AI activity', () => {
  it('lists jobs with details and pauses, resumes and stops them', async () => {
    let release!: () => void;
    const job = runJob(
      { id: 'j1', kind: 'enrich', label: 'Rust ownership', system: 'Be neutral.' },
      ({ signal }) =>
        new Promise<void>((res, rej) => {
          release = res;
          signal.addEventListener('abort', () => rej(signal.reason));
        }),
    );
    job.catch(() => {});
    render(<AiActivity />);
    const row = await screen.findByRole('button', { name: /Summary & tags: Rust ownership/ });
    await vi.waitFor(() => expect(row.textContent).toContain('running'));
    await click(row);
    expect(screen.getByText('Be neutral.')).toBeTruthy();

    await click(screen.getByRole('button', { name: 'Pause' }));
    await vi.waitFor(() => expect(row.textContent).toContain('paused'));
    await click(screen.getByRole('button', { name: 'Resume' }));
    await vi.waitFor(() => expect(row.textContent).toContain('running'));

    await click(screen.getByRole('button', { name: /Pause all/ }));
    expect(await screen.findByText('AI is paused')).toBeTruthy();
    await click(screen.getByRole('button', { name: /Resume all/ }));
    await screen.findByText('AI is working');

    await click(screen.getByRole('button', { name: /Stop all/ }));
    await vi.waitFor(() => expect(row.textContent).toContain('stopped'));
    release();
    await pauseAll();
    await resumeAll();
  });
});

describe('prompt settings', () => {
  it('saves a custom prompt and resets it', async () => {
    render(<PromptSettings />);
    const box = await screen.findByLabelText('Summarize content prompt');
    fireEvent.change(box, { target: { value: 'Three bullets.' } });
    fireEvent.blur(box);
    await vi.waitFor(async () =>
      expect((await getSettings()).ai.prompts.digest).toBe('Three bullets.'),
    );
    await click(screen.getByRole('button', { name: /Reset to default/ }));
    await vi.waitFor(async () =>
      expect((await getSettings()).ai.prompts.digest).toMatch(/^Summarize the given article/),
    );
  });
});
