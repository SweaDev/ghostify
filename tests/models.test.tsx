import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { embeddingModel, hasModel, languageModel, ollamaStatus } from '@/src/ai/models';
import { db } from '@/src/store/db';
import { getKeys, saveKey } from '@/src/store/secrets';
import { DEFAULT_SETTINGS, getSettings } from '@/src/store/settings';
import { AiSettings } from '@/src/ui/AiSettings';

const s = DEFAULT_SETTINGS;
const modelId = (m: unknown) => (m as { modelId: string }).modelId;
const providerOf = (m: unknown) => (m as { provider: string }).provider;

describe('model factory', () => {
  it('builds Ollama models against the configured URL', () => {
    const lm = languageModel(s.ai.general, s, {});
    expect(modelId(lm)).toBe('gemma4:e2b');
    expect(providerOf(lm)).toMatch(/ollama/);
    const em = embeddingModel(s.ai.embedding, s, {});
    expect(modelId(em)).toBe('embeddinggemma-2');
  });

  it('needs keys for cloud providers', () => {
    expect(() => languageModel({ provider: 'openai', model: 'gpt-5-mini' }, s, {})).toThrow(
      /API key/,
    );
    for (const provider of ['openai', 'openrouter', 'gemini'] as const) {
      const keys = { [provider]: 'k' };
      expect(modelId(languageModel({ provider, model: 'm' }, s, keys))).toBe('m');
      expect(modelId(embeddingModel({ provider, model: 'e' }, s, keys))).toBe('e');
    }
  });
});

describe('ollamaStatus', () => {
  const res = (status: number, body: unknown = {}) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('lists models and explains failures', async () => {
    const ok = await ollamaStatus(
      'http://x/',
      res(200, { models: [{ name: 'gemma4:e2b' }, { name: 'embeddinggemma-2:latest' }] }),
    );
    expect(ok.ok).toBe(true);
    expect(hasModel(ok.models, 'embeddinggemma-2')).toBe(true);
    expect(hasModel(ok.models, 'd3:2b')).toBe(false);
    expect((await ollamaStatus('http://x', res(403))).error).toMatch(/OLLAMA_ORIGINS/);
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect((await ollamaStatus('http://x', down)).error).toMatch(/Cannot reach/);
  });
});

describe('secrets', () => {
  beforeEach(() => db.secrets.clear());
  it('stores and clears keys outside storage.local', async () => {
    await saveKey('openai', ' sk-1 ');
    expect(await getKeys()).toEqual({ openai: 'sk-1' });
    await saveKey('openai', '');
    expect(await getKeys()).toEqual({});
  });
});

describe('AiSettings', () => {
  afterEach(cleanup);
  it('switches a purpose to a cloud provider and shows the key field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"models":[]}')),
    );
    render(<AiSettings />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Use AI' }));
    fireEvent.change(screen.getByLabelText('General model provider'), {
      target: { value: 'gemini' },
    });
    expect(await screen.findByLabelText('gemini API key')).toBeTruthy();
    await vi.waitFor(async () => {
      const ai = (await getSettings()).ai;
      expect(ai.enabled).toBe(true);
      expect(ai.general).toEqual({ provider: 'gemini', model: 'gemini-2.5-flash-lite' });
    });
    expect(screen.getAllByText(/Not pulled yet/).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
