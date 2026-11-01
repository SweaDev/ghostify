import { storage } from 'wxt/utils/storage';

export type Provider = 'ollama' | 'openai' | 'openrouter' | 'gemini';

export interface ModelRef {
  provider: Provider;
  model: string;
}

export interface Settings {
  ai: {
    enabled: boolean;
    ollamaBaseUrl: string;
    embedding: ModelRef;
    general: ModelRef;
    decision: ModelRef;
    keys: { openai?: string; openrouter?: string; gemini?: string };
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
    keys: {},
  },
  ui: { theme: 'system' },
};

const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', { fallback: {} });

/** Stored settings over the defaults (so new fields get their defaults). */
export function withDefaults(s: Partial<Settings>): Settings {
  return {
    ai: { ...DEFAULT_SETTINGS.ai, ...s.ai, keys: { ...s.ai?.keys } },
    ui: { ...DEFAULT_SETTINGS.ui, ...s.ui },
  };
}

export const getSettings = async () => withDefaults(await settingsItem.getValue());
export const saveSettings = (s: Settings) => settingsItem.setValue(s);
export const watchSettings = (cb: (s: Settings) => void) =>
  settingsItem.watch((v) => cb(withDefaults(v ?? {})));
