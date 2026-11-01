import { storage } from 'wxt/utils/storage';

export type Provider = 'ollama' | 'openai' | 'openrouter' | 'gemini';
export type Purpose = 'embedding' | 'general' | 'decision';
export type Keys = Partial<Record<Exclude<Provider, 'ollama'>, string>>;

export interface ModelRef {
  provider: Provider;
  model: string;
  /** OpenRouter only: the provider lists this as a decision model (saved when it is picked). */
  systemOne?: boolean;
}

export type PromptKey = 'enrich' | 'digest' | 'ask' | 'rule';
export type Prompts = Record<PromptKey, string>;

export const DEFAULT_PROMPTS: Prompts = {
  enrich:
    'You describe items from content feeds (posts, videos, articles). Write a neutral one-sentence summary of what the item is about and 1-5 short lowercase topic tags. Use only the given text.',
  digest:
    'Summarize the given article for someone deciding whether to read it. Start with one sentence on what it is about, then 3-6 short bullet points with the key points, then one line on who it is for. Use only the given text. Write plain text with "- " bullets.',
  ask: 'You answer questions about one article, using only its text below. Be concise. If the article does not answer the question, say so.',
  rule: 'Does this feed item match the rule: "{rule}"?',
};

export interface Settings {
  ai: {
    enabled: boolean;
    /** System prompts (and the System One rule question, with `{rule}`). */
    prompts: Prompts;
    ollamaBaseUrl: string;
    embedding: ModelRef;
    general: ModelRef;
    decision: ModelRef;
  };
  ui: { theme: 'system' | 'light' | 'dark' };
}

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    enabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    embedding: { provider: 'ollama', model: 'embeddinggemma-2' },
    general: { provider: 'ollama', model: 'gemma4:e2b' },
    decision: { provider: 'ollama', model: 'd3:2b' },
    prompts: DEFAULT_PROMPTS,
  },
  ui: { theme: 'system' },
};

const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', { fallback: {} });

/** Stored settings over the defaults (so new fields get their defaults). */
export function withDefaults(s: Partial<Settings>): Settings {
  return {
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...s.ai,
      prompts: { ...DEFAULT_PROMPTS, ...s.ai?.prompts },
    },
    ui: { ...DEFAULT_SETTINGS.ui, ...s.ui },
  };
}

/** A prompt, or its default when the stored one is blank. */
export const prompt = (s: Settings, k: PromptKey) => s.ai.prompts[k].trim() || DEFAULT_PROMPTS[k];

export const getSettings = async () => withDefaults(await settingsItem.getValue());
export const saveSettings = (s: Settings) => settingsItem.setValue(s);
export const watchSettings = (cb: (s: Settings) => void) =>
  settingsItem.watch((v) => cb(withDefaults(v ?? {})));
