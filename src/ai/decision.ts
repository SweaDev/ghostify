import type { LanguageModel } from 'ai';
import type { ClassifyRequest, ClassifyResponse, LlmResponse } from 'feedgrab';
import { handleLlmRequest } from 'feedgrab/llm';
import { getKeys } from '../store/secrets';
import { getSettings, type Keys, type ModelRef, type Settings } from '../store/settings';
import { isOpenRouterDecision, ollamaKinds } from './catalog';
import { key, languageModel, OPENROUTER_URL } from './models';

export interface SystemOneTarget {
  url: string;
  model: string;
  apiKey?: string;
}

/**
 * Where to send a System One decision request (`model` + `state` + typed `questions`), or
 * undefined for a chat model. Ollama decision models (d3, d1-omni, …) declare the `decision`
 * capability; OpenRouter decision models (Jev, …) list `decisions` as an output modality.
 */
export async function systemOneTarget(
  ref: ModelRef,
  settings: Settings,
  keys: Keys,
  fetcher: typeof fetch = fetch,
): Promise<SystemOneTarget | undefined> {
  if (ref.provider === 'ollama') {
    const base = settings.ai.ollamaBaseUrl;
    if (!(await ollamaKinds(base, ref.model, fetcher)).includes('decision')) return undefined;
    return { url: `${base.replace(/\/+$/, '')}/v1/systemone`, model: ref.model };
  }
  if (ref.provider === 'openrouter' && (await isOpenRouterDecision(ref.model, fetcher)))
    return { url: `${OPENROUTER_URL}/systemone`, model: ref.model, apiKey: key(ref, keys) };
  return undefined;
}

interface Answer {
  match: boolean;
  confidence: number;
}

/**
 * A System One answer to a yes/no ("noul") question, documented as `{ type: "noul", noul: 0.96 }`
 * (a probability). To be lenient this also accepts a boolean, a probability in 0..1, `{ value|answer, probability|confidence }`
 * or "true"/"false"; anything else is undefined (treated as no match).
 */
export function parseNoul(raw: unknown): Answer | undefined {
  const v = raw && typeof raw === 'object' && 'noul' in raw ? (raw as { noul: unknown }).noul : raw;
  if (typeof v === 'boolean') return { match: v, confidence: 1 };
  if (typeof v === 'number' && v >= 0 && v <= 1)
    return { match: v >= 0.5, confidence: v >= 0.5 ? v : 1 - v };
  if (v === 'true' || v === 'false') return { match: v === 'true', confidence: 1 };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const match = o.value ?? o.answer;
    const p = o.probability ?? o.confidence ?? o.score;
    if (typeof match === 'boolean')
      return { match, confidence: typeof p === 'number' ? Math.max(0, Math.min(1, p)) : 1 };
    if (typeof p === 'number') return parseNoul(p);
  }
  return undefined;
}

export function noulQuestions(criteria: string[]) {
  return Object.fromEntries(
    criteria.map((c, i) => [
      `c${i}`,
      {
        type: 'noul',
        instructions: `Does this feed item match the rule: "${c}"?`,
        criteria: { true: `The item matches: ${c}`, false: `The item does not match: ${c}` },
      },
    ]),
  );
}

/** Classifies each item with one System One call (one yes/no question per criterion). */
export async function systemOneClassify(
  req: ClassifyRequest,
  target: SystemOneTarget,
  fetcher: typeof fetch = fetch,
): Promise<ClassifyResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`;
  const questions = noulQuestions(req.criteria);
  const results: ClassifyResponse['results'] = [];
  for (const item of req.items) {
    const res = await fetcher(target.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: target.model, state: item.text, questions }),
    });
    if (!res.ok) throw new Error(`${target.model} answered ${res.status}`);
    const body = (await res.json()) as { answers?: Record<string, unknown> };
    const answers = body.answers ?? (body as Record<string, unknown>);
    let best: { i: number; a: Answer } | undefined;
    req.criteria.forEach((_, i) => {
      const a = parseNoul(answers[`c${i}`]);
      if (a === undefined)
        console.warn('[ghostify:decision] unrecognized answer', answers[`c${i}`]);
      if (a?.match && (!best || a.confidence > best.a.confidence)) best = { i, a };
    });
    results.push(
      best
        ? { id: item.id, exclude: true, criteriaIndex: best.i, confidence: best.a.confidence }
        : { id: item.id, exclude: false, confidence: 1 },
    );
  }
  return { results };
}

export interface DecisionDeps {
  settings: Settings;
  keys: Keys;
  model?: (ref: ModelRef) => LanguageModel;
  fetcher?: typeof fetch;
}

/**
 * Answers feedgrab LLM requests from content scripts. `classify` uses the decision model (a System
 * One model such as d3, d1-omni or Jev, or any chat model) and falls back to the general model on error; `detect` uses the
 * general model.
 */
export async function handleDecision(req: unknown, deps?: DecisionDeps): Promise<LlmResponse> {
  const { settings, keys, model, fetcher } = deps ?? {
    settings: await getSettings(),
    keys: await getKeys(),
  };
  if (!settings.ai.enabled) throw new Error('AI is turned off in Ghostify settings');
  const lm = model ?? ((ref: ModelRef) => languageModel(ref, settings, keys));
  const general = () => handleLlmRequest(req, lm(settings.ai.general));
  const r = req as { task?: string };
  if (r.task !== 'classify') return general();
  const decision = settings.ai.decision;
  try {
    const target = await systemOneTarget(decision, settings, keys, fetcher);
    if (target) return await systemOneClassify(req as ClassifyRequest, target, fetcher);
    return await handleLlmRequest(req, lm(decision));
  } catch (e) {
    console.warn('[ghostify:ai] decision model failed, using the general model', e);
    return general();
  }
}
