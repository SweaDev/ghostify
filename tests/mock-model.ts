import { simulateReadableStream } from 'ai';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';

/** A language model that always answers `text` (JSON for structured output). */
export function textModel(text: string | (() => string)) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: typeof text === 'function' ? text() : text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

/** An embedding model mapping each value through `vec`. */
export function embedModel(vec: (value: string) => number[]) {
  return new MockEmbeddingModelV4({
    doEmbed: async ({ values }) => ({ embeddings: values.map(vec), warnings: [] }),
  });
}

/** A language model that streams `parts` as text deltas (and records the prompts it got). */
export function streamModel(parts: string[] | ((prompt: unknown) => string[])) {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 't' },
          ...(typeof parts === 'function' ? parts(prompt) : parts).map((delta) => ({
            type: 'text-delta' as const,
            id: 't',
            delta,
          })),
          { type: 'text-end' as const, id: 't' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage,
          },
        ],
      }),
    }),
  });
}
