import type { ClassifyRequest } from 'feedgrab';
import {
  handleDecision,
  noulQuestions,
  parseNoul,
  systemOneClassify,
  systemOneTarget,
} from '@/src/ai/decision';
import { handlers } from '@/src/background/handlers';
import { db } from '@/src/store/db';
import { DEFAULT_SETTINGS, type Settings } from '@/src/store/settings';
import { textModel } from './mock-model';
import { OLLAMA_AI } from './ollama-ai';

const req: ClassifyRequest = {
  task: 'classify',
  criteria: ['crypto hype', 'job ads'],
  items: [
    { id: '1', text: 'Buy this coin now, to the moon' },
    { id: '2', text: 'A deep dive into Rust lifetimes' },
  ],
};
const on: Settings = {
  ...DEFAULT_SETTINGS,
  ai: { ...DEFAULT_SETTINGS.ai, ...OLLAMA_AI, enabled: true },
};

/** Fake d3: says yes to "crypto hype" for texts mentioning coins. */
const d3Fetch = vi.fn(async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  const coin = /coin/.test(body.state);
  return new Response(
    JSON.stringify({ answers: { c0: { noul: coin ? 0.92 : 0.1 }, c1: { noul: false } } }),
  );
}) as unknown as typeof fetch;

describe('d3 parsing', () => {
  it('accepts the answer shapes we know of', () => {
    expect(parseNoul({ noul: true })).toEqual({ match: true, confidence: 1 });
    expect(parseNoul({ noul: 0.8 })).toEqual({ match: true, confidence: 0.8 });
    expect(parseNoul({ noul: 0.2 })?.match).toBe(false);
    expect(parseNoul({ noul: { value: true, probability: 0.7 } })).toEqual({
      match: true,
      confidence: 0.7,
    });
    expect(parseNoul({ noul: { probability: 0.9 } })).toEqual({ match: true, confidence: 0.9 });
    expect(parseNoul('false')).toEqual({ match: false, confidence: 1 });
    expect(parseNoul({ noul: 'maybe' })).toBeUndefined();
    expect(parseNoul(undefined)).toBeUndefined();
  });

  it('builds one yes/no question per criterion', () => {
    expect(Object.keys(noulQuestions(['a', 'b']))).toEqual(['c0', 'c1']);
    expect(noulQuestions(['a']).c0?.type).toBe('noul');
  });
});

describe('systemOneTarget', () => {
  const caps = (c: Record<string, string[]>) =>
    (async (_url: string, init?: RequestInit) =>
      Response.json({
        capabilities: c[JSON.parse(String(init?.body)).model],
      })) as unknown as typeof fetch;
  const ollama = (model: string) => ({ provider: 'ollama' as const, model });
  const f = caps({
    'd1-omni': ['vision', 'decision', 'audio'],
    'tev1:0.8b': ['tools', 'decision', 'thinking'],
    'gemma4:e2b': ['completion'],
  });

  it('sends Ollama models with the decision capability to /v1/systemone', async () => {
    expect(await systemOneTarget(ollama('d1-omni'), on, {}, f)).toEqual({
      url: 'http://localhost:11434/v1/systemone',
      model: 'd1-omni',
    });
    expect(await systemOneTarget(ollama('tev1:0.8b'), on, {}, f)).toEqual({
      url: 'http://localhost:11434/v1/systemone',
      model: 'tev1:0.8b',
    });
    expect(await systemOneTarget(ollama('gemma4:e2b'), on, {}, f)).toBeUndefined();
    // Older Ollama without capabilities: d3 and Tev1 are still recognized by name.
    expect(await systemOneTarget(ollama('d3:2b'), on, {}, caps({}))).toBeDefined();
    expect(await systemOneTarget(ollama('tev1:4b'), on, {}, caps({}))).toBeDefined();
    expect(await systemOneTarget(ollama('tev1'), on, {}, caps({}))).toBeDefined();
  });

  it('sends OpenRouter decision models (Jev) to its System One API with the key', async () => {
    const jev = { provider: 'openrouter' as const, model: 'typesafe/jev-1.14' };
    expect(await systemOneTarget(jev, on, { openrouter: 'k' })).toEqual({
      url: 'https://openrouter.ai/api/v1/systemone',
      model: 'typesafe/jev-1.14',
      apiKey: 'k',
    });
    const acme = { provider: 'openrouter' as const, model: 'acme/decider', systemOne: true };
    expect(await systemOneTarget(acme, on, { openrouter: 'k' })).toBeDefined();
    const chat = { provider: 'openrouter' as const, model: 'openai/gpt-5-mini' };
    expect(await systemOneTarget(chat, on, { openrouter: 'k' })).toBeUndefined();
  });
});

describe('systemOneClassify', () => {
  it('posts to /v1/systemone and maps answers to feedgrab results', async () => {
    const res = await systemOneClassify(
      req,
      { url: 'http://o:11434/v1/systemone', model: 'd3:2b', apiKey: 'k' },
      d3Fetch,
    );
    expect(res.results).toEqual([
      { id: '1', exclude: true, criteriaIndex: 0, confidence: 0.92 },
      { id: '2', exclude: false, confidence: 1 },
    ]);
    const [url, init] = vi.mocked(d3Fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://o:11434/v1/systemone');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer k');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'd3:2b',
      state: req.items[0]?.text,
    });
  });
});

describe('handleDecision', () => {
  beforeEach(() => db.decisions.clear());

  const byokAnswer = JSON.stringify({
    results: [
      { id: '1', exclude: true, criteriaIndex: 0, confidence: 0.8 },
      { id: '2', exclude: false, confidence: 0.9 },
    ],
  });

  it('uses d3 for classify when configured', async () => {
    const res = await handleDecision(req, { settings: on, keys: {}, fetcher: d3Fetch });
    expect((res as { results: unknown[] }).results).toHaveLength(2);
  });

  it('uses the BYOK decision model through feedgrab', async () => {
    const model = vi.fn(() => textModel(byokAnswer));
    const settings = {
      ...on,
      ai: { ...on.ai, decision: { provider: 'openai' as const, model: 'gpt-5-nano' } },
    };
    const res = await handleDecision(req, { settings, keys: { openai: 'k' }, model });
    expect(model).toHaveBeenCalledWith(settings.ai.decision);
    expect((res as { results: { exclude: boolean }[] }).results[0]?.exclude).toBe(true);
  });

  it('falls back to the general model when d3 fails', async () => {
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const model = vi.fn(() => textModel(byokAnswer));
    const res = await handleDecision(req, { settings: on, keys: {}, fetcher: down, model });
    expect(model).toHaveBeenCalledWith(on.ai.general);
    expect((res as { results: unknown[] }).results).toHaveLength(2);
  });

  it('answers repeated items from cache and sends only new ones', async () => {
    const f = vi.fn(d3Fetch);
    await handleDecision(req, { settings: on, keys: {}, fetcher: f });
    const posts = () => f.mock.calls.filter(([u]) => String(u).endsWith('/systemone')).length;
    expect(posts()).toBe(2);
    const again = await handleDecision(req, { settings: on, keys: {}, fetcher: f });
    expect(posts()).toBe(2);
    expect(f).toHaveBeenCalledTimes(3); // 1 /api/show + 2 posts, none on the cached call
    expect((again as { results: unknown[] }).results).toEqual([
      { id: '1', exclude: true, criteriaIndex: 0, confidence: 0.92 },
      { id: '2', exclude: false, confidence: 1 },
    ]);
    const more = { ...req, items: [...req.items, { id: '3', text: 'Another coin' }] };
    await handleDecision(more, { settings: on, keys: {}, fetcher: f });
    expect(posts()).toBe(3);
    await handleDecision({ ...req, criteria: ['job ads'] }, { settings: on, keys: {}, fetcher: f });
    expect(posts()).toBe(5);
  });

  it('refuses when AI is off, and the message handler reports it', async () => {
    await expect(handleDecision(req, { settings: DEFAULT_SETTINGS, keys: {} })).rejects.toThrow(
      /off/,
    );
    const reply = await handlers.llm({ req });
    expect(reply).toMatchObject({ ok: false, error: { message: expect.stringMatching(/off/) } });
  });
});
