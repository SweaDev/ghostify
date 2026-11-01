import type { Settings } from '@/src/store/settings';

/** The Ollama models these tests mock (the defaults are in-browser models now). */
export const OLLAMA_AI: Pick<Settings['ai'], 'embedding' | 'general' | 'decision'> = {
  embedding: { provider: 'ollama', model: 'embeddinggemma-2' },
  general: { provider: 'ollama', model: 'gemma4:e2b' },
  decision: { provider: 'ollama', model: 'd3:2b' },
};
