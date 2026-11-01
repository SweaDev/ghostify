import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { specFor, specKey } from '@/src/ai/browser/catalog';
import * as messaging from '@/src/messaging';
import { downloadedItem, downloadsItem } from '@/src/store/browser-models';
import { getSettings } from '@/src/store/settings';
import { AiSettings } from '@/src/ui/AiSettings';

const key = (model: string, purpose: 'embedding' | 'general' | 'decision') =>
  specKey(specFor(model, purpose, 'wasm'));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"models":[]}')),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('in-browser models in AI settings', () => {
  it('defaults every purpose to in-browser models and downloads on request', async () => {
    const send = vi.spyOn(messaging, 'sendMessage').mockResolvedValue(undefined as never);
    render(<AiSettings />);
    const provider = (await screen.findByLabelText('General model provider')) as HTMLSelectElement;
    expect(provider.value).toBe('browser');
    expect(screen.getByText('SmolLM2 360M')).toBeTruthy();
    const [first] = screen.getAllByRole('button', { name: /^Download \(~\d+ MB\)$/ });
    expect(screen.getByRole('button', { name: /Download all \(~4\d\d MB\)/ })).toBeTruthy();
    await act(async () => void fireEvent.click(first as HTMLElement));
    expect(send).toHaveBeenCalledWith('browserModel', {
      action: 'download',
      purpose: 'embedding',
      model: 'Xenova/all-MiniLM-L6-v2',
    });
  });

  it('shows progress, errors and downloaded models with Delete', async () => {
    const send = vi.spyOn(messaging, 'sendMessage').mockResolvedValue(undefined as never);
    await downloadedItem.setValue({
      [key('Xenova/all-MiniLM-L6-v2', 'embedding')]: { at: 1, bytes: 23 * 1_048_576 },
    });
    await downloadsItem.setValue({
      [key('HuggingFaceTB/SmolLM2-360M-Instruct', 'general')]: { loaded: 50, total: 200 },
      [key('Xenova/nli-deberta-v3-xsmall', 'decision')]: { loaded: 0, total: 0, error: 'Offline' },
    });
    render(<AiSettings />);
    expect(await screen.findByText(/On this device · 23 MB/)).toBeTruthy();
    expect(screen.getByText(/Downloading 25% of/)).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry download/ })).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByLabelText('Delete MiniLM L6')));
    expect(send).toHaveBeenCalledWith('browserModel', {
      action: 'delete',
      purpose: 'embedding',
      model: 'Xenova/all-MiniLM-L6-v2',
    });
  });

  it('switches where the models run', async () => {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    render(<AiSettings />);
    await screen.findByText('In-browser models');
    await act(async () => void fireEvent.click(await screen.findByRole('button', { name: /GPU/ })));
    await vi.waitFor(async () => expect((await getSettings()).ai.device).toBe('webgpu'));
    // Another precision means another download.
    expect(screen.getAllByRole('button', { name: /^Download/ }).length).toBeGreaterThan(0);
    delete (navigator as { gpu?: unknown }).gpu;
  });
});
