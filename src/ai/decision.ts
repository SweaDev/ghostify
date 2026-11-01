import type { LanguageModel } from 'ai';
import type { ClassifyRequest, ClassifyResponse, LlmResponse } from 'feedgrab';
import { handleLlmRequest } from 'feedgrab/llm';
import { getKeys } from '../store/secrets';
import { getSettings, type Keys, type ModelRef, type Settings } from '../store/settings';
import { languageModel } from './models';

export const isD3 = (ref: ModelRef) => ref.provider === 'ollama' && /^d3(:|$)/.test(ref.model);

interface D3Answer {
  match: boolean;
  confidence: number;
}

/**
 * d3's `/v1/systemone` answer for a yes/no ("noul") question. The response shape is not fully
 * documented, so this accepts a boolean, a probability in 0..1, `{ value|answer, probability|confidence }`
 * or "true"/"false"; anything else is undefined (treated as no match).
 */
export function parseD3Answer(raw: unknown): D3Answer | undefined {
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
    if (typeof p === 'number') return parseD3Answer(p);
  }
  return undefined;
}

export function d3Questions(criteria: string[]) {
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

/** Classifies each item with one d3 call (one yes/no question per criterion). */
export async function d3Classify(
  req: ClassifyRequest,
  opts: { baseUrl: string; model: string; fetcher?: typeof fetch },
): Promise<ClassifyResponse> {
  const fetcher = opts.fetcher ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/v1/systemone`;
  const questions = d3Questions(req.criteria);
  const results: ClassifyResponse['results'] = [];
  for (const item of req.items) {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: opts.model, state: item.text, questions }),
    });
    if (!res.ok) throw new Error(`d3 answered ${res.status}`);
    const body = (await res.json()) as { answers?: Record<string, unknown> };
    const answers = body.answers ?? (body as Record<string, unknown>);
    let best: { i: number; a: D3Answer } | undefined;
    req.criteria.forEach((_, i) => {
      const a = parseD3Answer(answers[`c${i}`]);
      if (a === undefined) console.warn('[ghostify:d3] unrecognized answer', answers[`c${i}`]);
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
 * Answers feedgrab LLM requests from content scripts. `classify` uses the decision model (d3 via
 * Ollama, or any chat model) and falls back to the general model on error; `detect` uses the
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
    if (isD3(decision)) {
      return await d3Classify(req as ClassifyRequest, {
        baseUrl: settings.ai.ollamaBaseUrl,
        model: decision.model,
        fetcher,
      });
    }
    return await handleLlmRequest(req, lm(decision));
  } catch (e) {
    console.warn('[ghostify:ai] decision model failed, using the general model', e);
    return general();
  }
}
