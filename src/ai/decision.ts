import type { LanguageModel } from 'ai';
import type { ClassifyRequest, ClassifyResponse, LlmResponse } from 'feedgrab';
import { handleLlmRequest } from 'feedgrab/llm';
import { getKeys } from '../store/secrets';
import {
  DEFAULT_PROMPTS,
  getSettings,
  type Keys,
  type ModelRef,
  prompt,
  type Settings,
} from '../store/settings';
import {
  browserClassify,
  browserSpec,
  HYPOTHESIS,
  isReady,
  notDownloaded,
} from './browser/provider';
import { DECISION_NAME, type Kind, ollamaKinds } from './catalog';
import { cachedClassify } from './decision-cache';
import { modelTag } from './embed';
import { key, languageModel, OPENROUTER_URL } from './models';

export interface SystemOneTarget {
  url: string;
  model: string;
  apiKey?: string;
}

/**
 * Where to send a System One decision request (`model` + `state` + typed `questions`), or
 * undefined for a chat model. Ollama decision models (d3, Tev1, d1-omni, …) declare the `decision`
 * capability (checked locally). OpenRouter decision models (Jev, …) are flagged `systemOne` when
 * picked from its model list; a typed id falls back to its name.
 */
const KINDS_TTL = 10 * 60_000;
const kindsMemo = new Map<string, { at: number; kinds: Promise<Kind[]> }>();

/** Ollama capabilities, remembered for a while (asked before every uncached rule check). */
function memoKinds(base: string, model: string, fetcher: typeof fetch): Promise<Kind[]> {
  if (fetcher !== fetch) return ollamaKinds(base, model, fetcher);
  const k = `${base}|${model}`;
  const hit = kindsMemo.get(k);
  if (hit && Date.now() - hit.at < KINDS_TTL) return hit.kinds;
  const kinds = ollamaKinds(base, model, fetcher);
  kindsMemo.set(k, { at: Date.now(), kinds });
  return kinds;
}

export async function systemOneTarget(
  ref: ModelRef,
  settings: Settings,
  keys: Keys,
  fetcher: typeof fetch = fetch,
): Promise<SystemOneTarget | undefined> {
  if (ref.provider === 'ollama') {
    const base = settings.ai.ollamaBaseUrl;
    if (!(await memoKinds(base, ref.model, fetcher)).includes('decision')) return undefined;
    return { url: `${base.replace(/\/+$/, '')}/v1/systemone`, model: ref.model };
  }
  if (ref.provider === 'openrouter' && (ref.systemOne ?? DECISION_NAME.test(ref.model)))
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

export function noulQuestions(criteria: string[], template = DEFAULT_PROMPTS.rule) {
  return Object.fromEntries(
    criteria.map((c, i) => [
      `c${i}`,
      {
        type: 'noul',
        instructions: template.includes('{rule}')
          ? template.replaceAll('{rule}', c)
          : `${template}\nRule: ${c}`,
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
  opts: { template?: string; signal?: AbortSignal } = {},
): Promise<ClassifyResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`;
  const questions = noulQuestions(req.criteria, opts.template);
  const results: ClassifyResponse['results'] = [];
  for (const item of req.items) {
    const res = await fetcher(target.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: target.model, state: item.text, questions }),
      signal: opts.signal,
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
  settings?: Settings;
  keys?: Keys;
  model?: (ref: ModelRef) => LanguageModel;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Answers feedgrab LLM requests from content scripts. `classify` uses the decision model (a System
 * One model such as d3, d1-omni or Jev, or any chat model) and falls back to the general model on error; `detect` uses the
 * general model.
 */
export async function handleDecision(req: unknown, deps?: DecisionDeps): Promise<LlmResponse> {
  const { settings, keys, model, fetcher, signal } = {
    settings: deps?.settings ?? (await getSettings()),
    keys: deps?.keys ?? (await getKeys()),
    ...deps,
  };
  if (!settings.ai.enabled) throw new Error('AI is turned off in Ghostify settings');
  const lm = model ?? ((ref: ModelRef) => languageModel(ref, settings, keys));
  const general = () => handleLlmRequest(req, lm(settings.ai.general), { signal });
  const r = req as { task?: string };
  if (r.task !== 'classify') return general();
  const classify = req as ClassifyRequest;
  const decision = settings.ai.decision;
  const chat = (ref: ModelRef) => (r: ClassifyRequest) =>
    handleLlmRequest(r, lm(ref), { signal }) as Promise<ClassifyResponse>;
  // The rule question is part of the System One request, so it is part of the cache key.
  const template = prompt(settings, 'rule');
  try {
    // In-browser decision models are zero-shot (NLI) classifiers, not System One or chat models.
    if (decision.provider === 'browser') {
      if (!(await isReady(settings, 'decision'))) throw notDownloaded('decision');
      const spec = browserSpec(decision, 'decision', settings);
      return await cachedClassify(`${modelTag(decision)}|${HYPOTHESIS}`, classify, (r) =>
        browserClassify(r, spec, { signal }),
      );
    }
    const tag =
      template === DEFAULT_PROMPTS.rule ? modelTag(decision) : `${modelTag(decision)}|${template}`;
    return await cachedClassify(tag, classify, async (r) => {
      const target = await systemOneTarget(decision, settings, keys, fetcher);
      return target
        ? systemOneClassify(r, target, fetcher, { template, signal })
        : chat(decision)(r);
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('[ghostify:ai] decision model failed, using the general model', e);
    if (!(await isReady(settings, 'general'))) throw e;
    return cachedClassify(modelTag(settings.ai.general), classify, chat(settings.ai.general));
  }
}
