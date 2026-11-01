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
