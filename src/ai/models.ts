import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { createModel } from 'feedgrab/llm';
import type { Keys, ModelRef, Settings } from '../store/settings';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export const ollamaV1 = (s: Settings) => `${s.ai.ollamaBaseUrl.replace(/\/+$/, '')}/v1`;

function key(ref: ModelRef, keys: Keys): string | undefined {
  if (ref.provider === 'ollama') return undefined;
  const k = keys[ref.provider];
  if (!k) throw new Error(`Add an API key for ${ref.provider} in Settings → AI`);
  return k;
}

const factories = {
  ollama: createOpenAICompatible,
  openai: createOpenAI,
  openrouter: createOpenRouter,
  gemini: createGoogleGenerativeAI,
};

/** A chat model for a purpose's provider + model (via feedgrab's provider wiring). */
export function languageModel(ref: ModelRef, settings: Settings, keys: Keys): LanguageModel {
  return createModel(
    {
      provider: ref.provider,
      model: ref.model,
      apiKey: key(ref, keys),
      baseURL: ref.provider === 'ollama' ? ollamaV1(settings) : undefined,
    },
    factories,
  );
}

/** An embedding model; Ollama and OpenRouter use their OpenAI-compatible `/embeddings`. */
export function embeddingModel(ref: ModelRef, settings: Settings, keys: Keys): EmbeddingModel {
  const apiKey = key(ref, keys);
  switch (ref.provider) {
    case 'ollama':
      return createOpenAICompatible({ name: 'ollama', baseURL: ollamaV1(settings) }).embeddingModel(
        ref.model,
      );
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: OPENROUTER_URL,
        apiKey,
      }).embeddingModel(ref.model);
    case 'openai':
      return createOpenAI({ apiKey }).embeddingModel(ref.model);
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey }).embeddingModel(ref.model);
  }
}

/** Suggested models per provider and purpose (users can type any model id). */
export const SUGGESTED: Record<
  ModelRef['provider'],
  Record<'embedding' | 'general' | 'decision', string[]>
> = {
  ollama: {
    embedding: ['embeddinggemma-2', 'embeddinggemma-2:270m'],
    general: ['gemma4:e2b', 'gemma4:e4b'],
    decision: ['d3:2b', 'd3:4b', 'gemma4:e2b'],
  },
  openai: {
    embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
    general: ['gpt-5-mini', 'gpt-5-nano'],
    decision: ['gpt-5-nano', 'gpt-5-mini'],
  },
  openrouter: {
    embedding: ['openai/text-embedding-3-small', 'google/gemini-embedding-001'],
    general: ['google/gemma-4-e4b-it', 'openai/gpt-5-mini'],
    decision: ['openai/gpt-5-nano', 'google/gemma-4-e4b-it'],
  },
  gemini: {
    embedding: ['gemini-embedding-001'],
    general: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    decision: ['gemini-2.5-flash-lite'],
  },
};

export interface OllamaStatus {
  ok: boolean;
  models: string[];
  error?: string;
}

/** Lists pulled models (`/api/tags`); fails with a CORS hint when the extension origin is blocked. */
export async function ollamaStatus(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<OllamaStatus> {
  try {
    const res = await fetcher(`${baseUrl.replace(/\/+$/, '')}/api/tags`);
    if (res.status === 403)
      return { ok: false, models: [], error: 'Ollama blocked this extension (set OLLAMA_ORIGINS)' };
    if (!res.ok) return { ok: false, models: [], error: `Ollama answered ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (data.models ?? []).map((m) => m.name) };
  } catch (e) {
    // A CORS rejection (OLLAMA_ORIGINS unset) also lands here, as a TypeError.
    return {
      ok: false,
      models: [],
      error: `Cannot reach Ollama (is it running with OLLAMA_ORIGINS set?): ${(e as Error).message}`,
    };
  }
}

/** True when a pulled-models list has `model` (Ollama adds `:latest` to untagged names). */
export function hasModel(models: string[], model: string): boolean {
  return models.some((m) => m === model || m === `${model}:latest`);
}
