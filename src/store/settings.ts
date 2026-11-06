import { storage } from 'wxt/utils/storage';
import { DEFAULT_BROWSER, type Device } from '../ai/browser/catalog';

/** `browser` runs downloaded models in the browser itself (no GPU, server or key needed). */
export type Provider = 'browser' | 'ollama' | 'openai' | 'openrouter' | 'gemini';
export type Purpose = 'embedding' | 'general' | 'decision';
export type KeyProvider = Exclude<Provider, 'ollama' | 'browser'>;
export type Keys = Partial<Record<KeyProvider, string>>;

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

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Where the floating ghost button sits on a hovered feed item, in px from its corner. */
export interface ButtonPlacement {
  corner: Corner;
  /** Distance from the item's top or bottom edge (per `corner`). */
  vertical: number;
  /** Distance from the item's left or right edge (per `corner`). */
  horizontal: number;
}

export const MAX_BUTTON_MARGIN = 200;

export type SortBy = 'date' | 'relevance';
export type SortOrder = 'desc' | 'asc' | 'random';
/** How the Ghostify page orders items. */
export interface Sort {
  by: SortBy;
  order: SortOrder;
  /** Keeps a random order stable while the list updates; a new seed reshuffles. */
  seed: number;
}

export interface Settings {
  ai: {
    enabled: boolean;
    /** System prompts (and the System One rule question, with `{rule}`). */
    prompts: Prompts;
    ollamaBaseUrl: string;
    /** Where in-browser models run: CPU (WebAssembly) or GPU (WebGPU). */
    device: Device;
    embedding: ModelRef;
    general: ModelRef;
    decision: ModelRef;
  };
  ui: {
    theme: 'system' | 'light' | 'dark';
    ghostButton: ButtonPlacement;
    /** Per-site placements (by site id) that replace `ghostButton` on that site. */
    siteGhostButtons: Record<string, ButtonPlacement>;
    sort: Sort;
    /** Ghostify page search uses semantic (AI) search. */
    semantic: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    enabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    device: 'wasm',
    embedding: { provider: 'browser', model: DEFAULT_BROWSER.embedding },
    general: { provider: 'browser', model: DEFAULT_BROWSER.general },
    decision: { provider: 'browser', model: DEFAULT_BROWSER.decision },
    prompts: DEFAULT_PROMPTS,
  },
  ui: {
    theme: 'system',
    ghostButton: { corner: 'top-right', vertical: 8, horizontal: 8 },
    siteGhostButtons: {},
    sort: { by: 'date', order: 'desc', seed: 0 },
    semantic: false,
  },
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
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...s.ui,
      ghostButton: { ...DEFAULT_SETTINGS.ui.ghostButton, ...s.ui?.ghostButton },
      siteGhostButtons: { ...s.ui?.siteGhostButtons },
      sort: { ...DEFAULT_SETTINGS.ui.sort, ...s.ui?.sort },
    },
  };
}

/** The ghost button placement on a site: its override, else the global one. */
export const placementFor = (s: Settings, siteId?: string): ButtonPlacement =>
  (siteId && s.ui.siteGhostButtons[siteId]) || s.ui.ghostButton;

/** A prompt, or its default when the stored one is blank. */
export const prompt = (s: Settings, k: PromptKey) => s.ai.prompts[k].trim() || DEFAULT_PROMPTS[k];

export const getSettings = async () => withDefaults(await settingsItem.getValue());
export const saveSettings = (s: Settings) => settingsItem.setValue(s);
export const watchSettings = (cb: (s: Settings) => void) =>
  settingsItem.watch((v) => cb(withDefaults(v ?? {})));
