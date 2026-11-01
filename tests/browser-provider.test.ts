import { embed, generateText, Output, streamText } from 'ai';
import { z } from 'zod';
import { specFor, specKey } from '@/src/ai/browser/catalog';
import { BrowserHost, type Channel } from '@/src/ai/browser/host';
import type { HostEnvelope, HostEvent } from '@/src/ai/browser/protocol';
import {
  browserClassify,
  browserEmbeddingModel,
  browserLanguageModel,
  extractJson,
  isReady,
  jsonPrefix,
} from '@/src/ai/browser/provider';
import { handleDecision } from '@/src/ai/decision';
import { downloadedItem } from '@/src/store/browser-models';
import { DEFAULT_SETTINGS, type Settings } from '@/src/store/settings';

/** A host whose worker answers with `reply(request)`; generate replies stream word by word. */
function fakeHost(reply: (req: HostEnvelope['req']) => unknown) {
  const listeners: ((e: HostEvent) => void)[] = [];
  const reqs: HostEnvelope['req'][] = [];
  const ch: Channel = {
    post: ({ id, req }) => {
      reqs.push(req);
      queueMicrotask(() => {
        const result = reply(req) as { text?: string };
        if (req.op === 'generate' && result.text)
          for (const w of result.text.split(/(?<= )/))
            for (const l of listeners) l({ id, type: 'delta', text: w });
        for (const l of listeners) l({ id, type: 'done', result });
      });
    },
    onEvent: (cb) => listeners.push(cb),
    onClose: () => {},
  };
  return { host: new BrowserHost(async () => ch), reqs };
}

const gen = specFor('HuggingFaceTB/SmolLM2-360M-Instruct', 'general', 'wasm');
const on: Settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, enabled: true } };

describe('browser provider defaults', () => {
  it('uses in-browser models for every purpose, on the CPU', () => {
    for (const p of ['embedding', 'general', 'decision'] as const)
      expect(DEFAULT_SETTINGS.ai[p].provider).toBe('browser');
    expect(DEFAULT_SETTINGS.ai.device).toBe('wasm');
    expect(DEFAULT_SETTINGS.ai.enabled).toBe(false);
  });

  it('is ready only once the model is downloaded', async () => {
    expect(await isReady(on, 'general')).toBe(false);
    await downloadedItem.setValue({ [specKey(gen)]: { at: 1, bytes: 1 } });
    expect(await isReady(on, 'general')).toBe(true);
    expect(await isReady({ ...on, ai: { ...on.ai, device: 'webgpu' } }, 'general')).toBe(false);
  });
});

describe('JSON from small models', () => {
  const schema = {
    type: 'object',
    properties: { summary: { type: 'string' }, tags: { type: 'array' } },
    required: ['summary', 'tags'],
  };
  it('primes, extracts, closes and fills required fields', () => {
    expect(jsonPrefix(schema)).toBe('{"summary": "');
    expect(
      JSON.parse(extractJson('{"summary": "A", "tags": ["x"]} and more {junk}', schema)),
    ).toEqual({
      summary: 'A',
      tags: ['x'],
    });
    expect(JSON.parse(extractJson('{"summary": "Cut off', schema))).toEqual({
      summary: 'Cut off',
      tags: [],
    });
    expect(JSON.parse(extractJson('Sure! ```{"summary": "a \\"q\\" }"}```', schema)).summary).toBe(
      'a "q" }',
    );
  });
});

describe('AI SDK adapters', () => {
  it('generates structured output', async () => {
    const { host, reqs } = fakeHost(() => ({
      text: '{"summary": "Rust ownership basics"}',
      outputTokens: 9,
      finish: 'stop',
    }));
    const { output } = await generateText({
      model: browserLanguageModel(gen, host),
      system: 'Describe it.',
      prompt: 'Title: Rust',
      output: Output.object({
        schema: z.object({ summary: z.string(), tags: z.array(z.string()) }),
      }),
    });
    expect(output).toEqual({ summary: 'Rust ownership basics', tags: [] });
    const req = reqs[0] as Extract<HostEnvelope['req'], { op: 'generate' }>;
    expect(req.prefix).toBe('{"summary": "');
    expect(req.messages[0]?.content).toMatch(/^Describe it\.\n\nReply with only one JSON object/);
    expect(req.messages[1]).toEqual({ role: 'user', content: 'Title: Rust' });
  });

  it('streams text and embeds', async () => {
    const { host } = fakeHost((req) =>
      req.op === 'embed'
        ? req.texts.map(() => [0.6, 0.8])
        : { text: 'Owners free memory.', outputTokens: 4, finish: 'stop' },
    );
    const res = streamText({ model: browserLanguageModel(gen, host), prompt: 'Why?' });
    const parts: string[] = [];
    for await (const d of res.textStream) parts.push(d);
    expect(parts.join('')).toBe('Owners free memory.');
    expect(parts.length).toBeGreaterThan(1);
    const spec = specFor('Xenova/all-MiniLM-L6-v2', 'embedding', 'wasm');
    const { embedding } = await embed({ model: browserEmbeddingModel(spec, host), value: 'x' });
    expect(embedding).toEqual([0.6, 0.8]);
  });
});

describe('zero-shot rule checks', () => {
  const nli = specFor('Xenova/nli-deberta-v3-xsmall', 'decision', 'wasm');
  const req = {
    task: 'classify' as const,
    criteria: ['crypto hype', 'an advertisement'],
    items: [
      { id: 'a', text: 'Bitcoin to the moon' },
      { id: 'b', text: 'How Rust ownership works' },
    ],
  };
  const scores = (text: string) => (text.startsWith('Bitcoin') ? [0.95, 0.5] : [0.01, 0.2]);

  it('maps scores to the best matching rule above the threshold', async () => {
    const { host, reqs } = fakeHost((r) => ({ scores: r.op === 'classify' ? scores(r.text) : [] }));
    const { results } = await browserClassify(req, nli, { host });
    expect(results).toEqual([
      { id: 'a', exclude: true, criteriaIndex: 0, confidence: 0.95 },
      { id: 'b', exclude: false, confidence: 0.8 },
    ]);
    expect(reqs[0]).toMatchObject({ op: 'classify', template: 'This item is about {}.' });
  });

  it('refuses rule checks with an undownloaded decision model', async () => {
    await downloadedItem.setValue({});
    await expect(handleDecision(req, { settings: on, keys: {} })).rejects.toThrow(/Download/);
  });
});
