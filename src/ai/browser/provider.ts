import type {
  EmbeddingModelV4,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { ClassifyRequest, ClassifyResponse } from 'feedgrab';
import { downloadedItem } from '../../store/browser-models';
import type { ModelRef, Purpose, Settings } from '../../store/settings';
import { type Spec, specFor, specKey } from './catalog';
import { type BrowserHost, host as defaultHost } from './host';
import type { ChatMessage, ClassifyResult, GenerateResult } from './protocol';

/** The worker spec for a purpose's model in the chosen device. */
export const browserSpec = (ref: ModelRef, purpose: Purpose, settings: Settings): Spec =>
  specFor(ref.model, purpose, settings.ai.device);

/** False when a purpose uses an in-browser model that isn't downloaded (other providers: true). */
export async function isReady(settings: Settings, purpose: Purpose): Promise<boolean> {
  const ref = settings.ai[purpose];
  if (ref.provider !== 'browser') return true;
  try {
    return !!(await downloadedItem.getValue())[specKey(browserSpec(ref, purpose, settings))];
  } catch {
    return false;
  }
}

export const notDownloaded = (purpose: Purpose) =>
  new Error(`Download the ${purpose} model in Settings → AI first`);

/** Characters of article text small CPU models read (vs 24k for others). */
export const BROWSER_MAX_CONTENT = 6_000;

const DEFAULT_MAX_TOKENS = 384;

function toMessages(opts: LanguageModelV4CallOptions): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of opts.prompt) {
    if (m.role === 'system') out.push({ role: 'system', content: m.content });
    else if (m.role === 'user' || m.role === 'assistant') {
      const text = m.content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
        .trim();
      if (text) out.push({ role: m.role, content: text });
    }
  }
  const format = opts.responseFormat;
  if (format?.type === 'json') {
    const shape = format.schema
      ? ` matching this JSON schema: ${JSON.stringify(format.schema)}`
      : '';
    const rule = `Reply with only one JSON object${shape}. No prose, no code fences.`;
    const sys = out.find((m) => m.role === 'system');
    if (sys) sys.content = `${sys.content}\n\n${rule}`;
    else out.unshift({ role: 'system', content: rule });
  }
  return out;
}

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
};

const EMPTY: Record<string, unknown> = { array: [], string: '', number: 0, boolean: false };

/** The reply's start for JSON output: the first property's key (and quote when it's a string). */
export function jsonPrefix(schema?: Schema): string {
  const [key, prop] = Object.entries(schema?.properties ?? {})[0] ?? [];
  return key ? `{"${key}": ${prop?.type === 'string' ? '"' : ''}` : '{';
}

/**
 * The first JSON object in a small model's reply: it may add prose after it or stop mid-way
 * (closed here), and may leave out required fields (filled with empty values of their type).
 */
export function extractJson(text: string, schema?: Schema): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  const stack: string[] = [];
  let inStr = false;
  let end = -1;
  for (let i = start; i < text.length && end === -1; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) end = i;
    }
  }
  const raw =
    end === -1
      ? `${text.slice(start).replace(/,\s*$/, '')}${inStr ? '"' : ''}${stack.reverse().join('')}`
      : text.slice(start, end + 1);
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of schema?.required ?? []) {
      const t = schema?.properties?.[k]?.type;
      if (obj[k] === undefined && t && t in EMPTY) obj[k] = EMPTY[t];
    }
    return JSON.stringify(obj);
  } catch {
    return raw;
  }
}

const usage = (r?: GenerateResult): LanguageModelV4Usage => ({
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: r?.outputTokens, text: r?.outputTokens, reasoning: undefined },
});

const finish = (r: GenerateResult): LanguageModelV4FinishReason => ({
  unified: r.finish === 'length' ? 'length' : r.finish === 'interrupted' ? 'interrupted' : 'stop',
  raw: r.finish,
});

/** An AI SDK chat model that runs in the browser (model worker). */
export function browserLanguageModel(spec: Spec, host: BrowserHost = defaultHost): LanguageModelV4 {
  const schemaOf = (o: LanguageModelV4CallOptions) =>
    o.responseFormat?.type === 'json' ? ((o.responseFormat.schema ?? {}) as Schema) : undefined;
  const request = (o: LanguageModelV4CallOptions) => {
    const schema = schemaOf(o);
    return {
      op: 'generate' as const,
      spec,
      messages: toMessages(o),
      maxNewTokens: o.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      temperature: o.temperature,
      prefix: schema && jsonPrefix(schema),
    };
  };
  return {
    specificationVersion: 'v4',
    provider: 'browser',
    modelId: spec.model,
    supportedUrls: {},
    async doGenerate(o) {
      const r = await host.call<GenerateResult>(request(o), { signal: o.abortSignal });
      const schema = schemaOf(o);
      const text = schema ? extractJson(r.text, schema) : r.text;
      return {
        content: [{ type: 'text', text }],
        finishReason: finish(r),
        usage: usage(r),
        warnings: [],
      };
    },
    async doStream(o) {
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'text-start', id: 't' });
          host
            .call<GenerateResult>(request(o), {
              signal: o.abortSignal,
              onDelta: (delta) => c.enqueue({ type: 'text-delta', id: 't', delta }),
            })
            .then(
              (r) => {
                c.enqueue({ type: 'text-end', id: 't' });
                c.enqueue({ type: 'finish', finishReason: finish(r), usage: usage(r) });
              },
              (error) => c.enqueue({ type: 'error', error }),
            )
            .finally(() => c.close());
        },
      });
      return { stream };
    },
  };
}

/** An AI SDK embedding model that runs in the browser (normalized vectors). */
export function browserEmbeddingModel(
  spec: Spec,
  host: BrowserHost = defaultHost,
): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'browser',
    modelId: spec.model,
    maxEmbeddingsPerCall: 16,
    supportsParallelCalls: false,
    async doEmbed({ values, abortSignal }) {
      const embeddings = await host.call<number[][]>(
        { op: 'embed', spec, texts: values },
        { signal: abortSignal },
      );
      return { embeddings, warnings: [] };
    },
  };
}

/** NLI hypothesis for a rule (zero-shot classification). */
export const HYPOTHESIS = 'This item is about {}.';
/** Entailment score from which a rule counts as matched. */
export const MATCH_AT = 0.7;

/** Classifies feed items against rules with a zero-shot (NLI) model, one call per item. */
export async function browserClassify(
  req: ClassifyRequest,
  spec: Spec,
  opts: { signal?: AbortSignal; host?: BrowserHost } = {},
): Promise<ClassifyResponse> {
  const h = opts.host ?? defaultHost;
  const results: ClassifyResponse['results'] = [];
  for (const item of req.items) {
    const { scores } = await h.call<ClassifyResult>(
      { op: 'classify', spec, text: item.text, labels: req.criteria, template: HYPOTHESIS },
      { signal: opts.signal },
    );
    let best = -1;
    scores.forEach((s, i) => {
      if (s >= MATCH_AT && (best === -1 || s > (scores[best] ?? 0))) best = i;
    });
    results.push(
      best === -1
        ? { id: item.id, exclude: false, confidence: 1 - Math.max(0, ...scores) }
        : { id: item.id, exclude: true, criteriaIndex: best, confidence: scores[best] ?? 0 },
    );
  }
  return { results };
}
