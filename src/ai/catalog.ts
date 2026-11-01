import type { Provider, Purpose } from '../store/settings';
import { ollamaStatus } from './models';

/** What a model can do. A purpose's dropdown lists the models of the matching kind. */
export type Kind = 'embedding' | 'chat' | 'decision';

export interface ModelInfo {
  id: string;
  kinds: Kind[];
}

export interface ModelGroup {
  label: string;
  models: string[];
}

export interface CatalogOptions {
  key?: string;
  ollamaBaseUrl: string;
  fetcher?: typeof fetch;
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models?output_modalities=all';
const OPENAI_MODELS = 'https://api.openai.com/v1/models';

/** Names that mark a decision model (d3, Jev, Tev1, or a future "...-decision-..." model). */
export const DECISION_NAME = /(^|\/)(d3|jev|tev1)([:-]|$)|decision/i;

const kinds = (...k: (Kind | false)[]) => k.filter((x): x is Kind => !!x);

async function getJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await fetcher(url, init);
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

/** Gemini declares `supportedGenerationMethods` (generateContent, embedContent, …). */
async function gemini(o: CatalogOptions, fetcher: typeof fetch): Promise<ModelInfo[]> {
  type Page = {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
    nextPageToken?: string;
  };
  const out: ModelInfo[] = [];
  let token = '';
  do {
    const url = `${GEMINI_URL}?pageSize=1000${token && `&pageToken=${encodeURIComponent(token)}`}`;
    const page = await getJson<Page>(fetcher, url, { headers: { 'x-goog-api-key': o.key ?? '' } });
    for (const m of page.models ?? []) {
      const methods = m.supportedGenerationMethods ?? [];
      const id = m.name.replace(/^models\//, '');
      out.push({
        id,
        kinds: kinds(
          methods.some((x) => /embed/i.test(x)) && 'embedding',
          methods.includes('generateContent') && 'chat',
          (methods.some((x) => /decision|decide/i.test(x)) || DECISION_NAME.test(id)) && 'decision',
        ),
      });
    }
    token = page.nextPageToken ?? '';
  } while (token);
  return out;
}

/** OpenRouter declares `architecture.output_modalities` (text, embeddings, decisions, …). */
async function openrouter(o: CatalogOptions, fetcher: typeof fetch): Promise<ModelInfo[]> {
  type Res = { data?: { id: string; architecture?: { output_modalities?: string[] } }[] };
  const headers: Record<string, string> = o.key ? { authorization: `Bearer ${o.key}` } : {};
  const { data = [] } = await getJson<Res>(fetcher, OPENROUTER_MODELS, { headers });
  return data.map((m) => {
    const out = m.architecture?.output_modalities ?? ['text'];
    return {
      id: m.id,
      kinds: kinds(
        out.includes('embeddings') && 'embedding',
        out.includes('text') && 'chat',
        out.includes('decisions') && 'decision',
      ),
    };
  });
}

/** OpenAI's model list has no type field, so the kind comes from the id. */
const OPENAI_CHAT = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_NOT_CHAT = /audio|realtime|tts|transcribe|image|moderation|instruct|search|sora/;

export function openaiKinds(id: string): Kind[] {
  return kinds(
    id.includes('embedding') && 'embedding',
    OPENAI_CHAT.test(id) && !OPENAI_NOT_CHAT.test(id) && 'chat',
    DECISION_NAME.test(id) && 'decision',
  );
}

async function openai(o: CatalogOptions, fetcher: typeof fetch): Promise<ModelInfo[]> {
  const { data = [] } = await getJson<{ data?: { id: string }[] }>(fetcher, OPENAI_MODELS, {
    headers: { authorization: `Bearer ${o.key ?? ''}` },
  });
  return data.map((m) => ({ id: m.id, kinds: openaiKinds(m.id) }));
}

/** Ollama's `/api/show` declares `capabilities` (completion, embedding, decision, …). */
export async function ollamaKinds(
  baseUrl: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<Kind[]> {
  const caps = await getJson<{ capabilities?: string[] }>(
    fetcher,
    `${baseUrl.replace(/\/+$/, '')}/api/show`,
    { method: 'POST', body: JSON.stringify({ model: id }) },
  )
    .then((r) => r.capabilities)
    .catch(() => undefined);
  // Older Ollama versions report no capabilities: guess from the name.
  if (!caps?.length) {
    const embedding = /embed/i.test(id);
    return kinds(
      embedding && 'embedding',
      !embedding && 'chat',
      DECISION_NAME.test(id) && 'decision',
    );
  }
  return kinds(
    caps.includes('embedding') && 'embedding',
    caps.includes('completion') && 'chat',
    (caps.includes('decision') || DECISION_NAME.test(id)) && 'decision',
  );
}

async function ollama(o: CatalogOptions, fetcher: typeof fetch): Promise<ModelInfo[]> {
  const st = await ollamaStatus(o.ollamaBaseUrl, fetcher);
  if (!st.ok) throw new Error(st.error);
  return Promise.all(
    st.models.map(async (id) => ({ id, kinds: await ollamaKinds(o.ollamaBaseUrl, id, fetcher) })),
  );
}

const LISTERS = { gemini, openrouter, openai, ollama };

/** Lists a provider's models with what each can do. Throws when the provider can't be reached. */
export function listModels(provider: Provider, o: CatalogOptions): Promise<ModelInfo[]> {
  return LISTERS[provider](o, o.fetcher ?? fetch);
}

/** True when listing this provider's models needs an API key first. */
export const needsKey = (p: Provider) => p === 'gemini' || p === 'openai';

/**
 * Dropdown groups for a purpose. Decision lists the provider's decision models first (when it has
 * any) and then every chat model, since any chat model can answer the rules.
 */
export function groupsFor(purpose: Purpose, models: ModelInfo[]): ModelGroup[] {
  const of = (k: Kind) =>
    models
      .filter((m) => m.kinds.includes(k))
      .map((m) => m.id)
      .sort();
  if (purpose === 'embedding') return [{ label: 'Embedding models', models: of('embedding') }];
  const chat = of('chat');
  if (purpose === 'general') return [{ label: 'Chat models', models: chat }];
  const decision = of('decision');
  return [
    { label: 'Decision models', models: decision },
    { label: 'Chat models', models: chat.filter((m) => !decision.includes(m)) },
  ].filter((g) => g.models.length);
}
