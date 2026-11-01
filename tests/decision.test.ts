import type { ClassifyRequest } from 'feedgrab';
import { d3Classify, d3Questions, handleDecision, isD3, parseD3Answer } from '@/src/ai/decision';
import { handlers } from '@/src/background/handlers';
import { DEFAULT_SETTINGS, type Settings } from '@/src/store/settings';
import { textModel } from './mock-model';

const req: ClassifyRequest = {
  task: 'classify',
  criteria: ['crypto hype', 'job ads'],
  items: [
    { id: '1', text: 'Buy this coin now, to the moon' },
    { id: '2', text: 'A deep dive into Rust lifetimes' },
  ],
};
const on: Settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, enabled: true } };

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
    expect(parseD3Answer({ noul: true })).toEqual({ match: true, confidence: 1 });
    expect(parseD3Answer({ noul: 0.8 })).toEqual({ match: true, confidence: 0.8 });
    expect(parseD3Answer({ noul: 0.2 })?.match).toBe(false);
    expect(parseD3Answer({ noul: { value: true, probability: 0.7 } })).toEqual({
      match: true,
      confidence: 0.7,
    });
    expect(parseD3Answer({ noul: { probability: 0.9 } })).toEqual({ match: true, confidence: 0.9 });
    expect(parseD3Answer('false')).toEqual({ match: false, confidence: 1 });
    expect(parseD3Answer({ noul: 'maybe' })).toBeUndefined();
    expect(parseD3Answer(undefined)).toBeUndefined();
  });

  it('builds one yes/no question per criterion', () => {
    expect(Object.keys(d3Questions(['a', 'b']))).toEqual(['c0', 'c1']);
    expect(d3Questions(['a']).c0?.type).toBe('noul');
    expect(isD3({ provider: 'ollama', model: 'd3:2b' })).toBe(true);
    expect(isD3({ provider: 'ollama', model: 'd3' })).toBe(true);
    expect(isD3({ provider: 'openrouter', model: 'd3:2b' })).toBe(false);
  });
});

describe('d3Classify', () => {
  it('posts to /v1/systemone and maps answers to feedgrab results', async () => {
    const res = await d3Classify(req, {
      baseUrl: 'http://o:11434/',
      model: 'd3:2b',
      fetcher: d3Fetch,
    });
    expect(res.results).toEqual([
      { id: '1', exclude: true, criteriaIndex: 0, confidence: 0.92 },
      { id: '2', exclude: false, confidence: 1 },
    ]);
    expect(vi.mocked(d3Fetch).mock.calls[0]?.[0]).toBe('http://o:11434/v1/systemone');
  });
});

describe('handleDecision', () => {
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

  it('refuses when AI is off, and the message handler reports it', async () => {
    await expect(handleDecision(req, { settings: DEFAULT_SETTINGS, keys: {} })).rejects.toThrow(
      /off/,
    );
    const reply = await handlers.llm({ req });
    expect(reply).toMatchObject({ ok: false, error: { message: expect.stringMatching(/off/) } });
  });
});
