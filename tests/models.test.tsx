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

  it("lists the provider's models in the dropdown and allows any id", async () => {
    await saveKey('gemini', 'k');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('googleapis')
          ? Response.json({
              models: [
                { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
              ],
            })
          : Response.json({ models: [] }),
      ),
    );
    render(<AiSettings />);
    const provider = await screen.findByLabelText('Decision model provider');
    fireEvent.change(provider, { target: { value: 'gemini' } });
    const select = screen.getByLabelText('Decision model model') as HTMLSelectElement;
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: 'gemini-3-flash' })).toBeTruthy(),
    );
    expect(screen.queryByRole('option', { name: 'gemini-embedding-2' })).toBeNull();
    fireEvent.change(select, { target: { value: 'gemini-3-flash' } });
    await vi.waitFor(async () =>
      expect((await getSettings()).ai.decision.model).toBe('gemini-3-flash'),
    );
    fireEvent.change(select, { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Decision model model id'), {
      target: { value: 'my-model' },
    });
    await vi.waitFor(async () => expect((await getSettings()).ai.decision.model).toBe('my-model'));
    vi.unstubAllGlobals();
    await saveKey('gemini', '');
  });

  it('remembers whether a picked OpenRouter model is a decision model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('openrouter')
          ? Response.json({
              data: [
                { id: 'acme/decider', architecture: { output_modalities: ['decisions'] } },
                { id: 'acme/chat', architecture: { output_modalities: ['text'] } },
              ],
            })
          : Response.json({ models: [] }),
      ),
    );
    render(<AiSettings />);
    fireEvent.change(await screen.findByLabelText('Decision model provider'), {
      target: { value: 'openrouter' },
    });
    await screen.findByRole('option', { name: 'acme/decider' });
    const select = screen.getByLabelText('Decision model model');
    fireEvent.change(select, { target: { value: 'acme/decider' } });
    await vi.waitFor(async () =>
      expect((await getSettings()).ai.decision).toMatchObject({
        model: 'acme/decider',
        systemOne: true,
      }),
    );
    fireEvent.change(select, { target: { value: 'acme/chat' } });
    await vi.waitFor(async () =>
      expect((await getSettings()).ai.decision).toMatchObject({
        model: 'acme/chat',
        systemOne: false,
      }),
    );
    vi.unstubAllGlobals();
  });
});
