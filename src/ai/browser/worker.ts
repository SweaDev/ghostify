/// <reference lib="webworker" />
/**
 * Runs in-browser models (Transformers.js / ONNX Runtime Web) in a dedicated worker started by
 * `offscreen.html`. Model files come from the Cache Storage after the user downloaded them.
 */
import {
  env,
  InterruptableStoppingCriteria,
  type PipelineType,
  pipeline,
  TextStreamer,
} from '@huggingface/transformers';
import type { Spec } from './catalog';
import { gatedFetch } from './gate';
import type { ChatMessage, HostEnvelope, HostEvent, HostRequest } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
// ONNX Runtime's glue is bundled into this worker and its wasm ships with the extension (a Vite
// asset): MV3 forbids remote code, so drop Transformers.js's CDN paths and its blob-URL wasm cache.
env.useWasmCache = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = undefined as never;
  wasm.numThreads = 1;
}

/** Models whose files may be fetched right now (a download the user started). */
const downloading = new Set<string>();
env.fetch = gatedFetch(env.fetch as typeof fetch, downloading);

// biome-ignore lint/suspicious/noExplicitAny: Transformers.js pipelines differ per task
type Pipe = any;
const pipes = new Map<string, Promise<Pipe>>();
const stops = new Map<string, InterruptableStoppingCriteria>();
const pipeKey = (s: Spec) => `${s.model}@${s.dtype}@${s.device}`;

const post = (e: HostEvent) => self.postMessage(e);

function load(spec: Spec, onProgress?: (loaded: number, total: number) => void): Promise<Pipe> {
  const k = pipeKey(spec);
  let p = pipes.get(k);
  if (!p) {
    p = pipeline(spec.task as PipelineType, spec.model, {
      dtype: spec.dtype as never,
      device: spec.device,
      progress_callback: (i: { status: string; loaded?: number; total?: number }) => {
        if (i.status === 'progress_total') onProgress?.(i.loaded ?? 0, i.total ?? 0);
      },
    });
    pipes.set(k, p);
    p.catch(() => pipes.delete(k));
  }
  return p;
}

async function generate(id: string, req: Extract<HostRequest, { op: 'generate' }>) {
  const pipe = await load(req.spec);
  const stop = new InterruptableStoppingCriteria();
  stops.set(id, stop);
  let tokens = 0;
  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => text && post({ id, type: 'delta', text }),
    token_callback_function: () => {
      tokens++;
    },
  });
  // With a prefix the chat template is applied here and the reply continues from the prefix.
  const input =
    req.prefix === undefined
      ? (req.messages satisfies ChatMessage[])
      : `${pipe.tokenizer.apply_chat_template(req.messages, { tokenize: false, add_generation_prompt: true })}${req.prefix}`;
  if (req.prefix) post({ id, type: 'delta', text: req.prefix });
  try {
    const out = await pipe(input, {
      max_new_tokens: req.maxNewTokens,
      do_sample: (req.temperature ?? 0) > 0,
      temperature: req.temperature || undefined,
      // Tiny models loop without it.
      repetition_penalty: 1.15,
      add_special_tokens: false,
      return_full_text: false,
      streamer,
      stopping_criteria: stop,
    });
    const msgs = out?.[0]?.generated_text;
    const text = Array.isArray(msgs)
      ? String(msgs.at(-1)?.content ?? '')
      : `${req.prefix ?? ''}${msgs ?? ''}`;
    const finish = stop.interrupted
      ? 'interrupted'
      : tokens >= req.maxNewTokens
        ? 'length'
        : 'stop';
    return { text: text.trim(), outputTokens: tokens, finish };
  } finally {
    stops.delete(id);
  }
}

async function handle(id: string, req: HostRequest): Promise<unknown> {
  switch (req.op) {
    case 'ping':
      return 'pong';
    case 'load': {
      let bytes = 0;
      if (req.download) downloading.add(req.spec.model);
      try {
        await load(req.spec, (loaded, total) => {
          bytes = total;
          post({ id, type: 'progress', loaded, total });
        });
      } finally {
        downloading.delete(req.spec.model);
      }
      return { bytes };
    }
    case 'embed': {
      const pipe = await load(req.spec);
      const out = await pipe(req.texts, { pooling: req.spec.pooling ?? 'mean', normalize: true });
      return out.tolist() as number[][];
    }
    case 'generate':
      return generate(id, req);
    case 'classify': {
      const pipe = await load(req.spec);
      const out = (await pipe(req.text, req.labels, {
        multi_label: true,
        hypothesis_template: req.template,
      })) as { labels: string[]; scores: number[] };
      const by = new Map(out.labels.map((l, i) => [l, out.scores[i] ?? 0]));
      return { scores: req.labels.map((l) => by.get(l) ?? 0) };
    }
    case 'abort':
      stops.get(req.target)?.interrupt();
      return null;
    case 'unload': {
      for (const [k, p] of pipes) {
        if (!k.startsWith(`${req.model}@`)) continue;
        pipes.delete(k);
        await p.then((x: Pipe) => x.dispose?.()).catch(() => {});
      }
      return null;
    }
  }
}

/** Ops that load or run ONNX sessions; a failure there leaves Transformers.js unusable. */
const MODEL_OPS = new Set<HostRequest['op']>(['load', 'embed', 'generate', 'classify']);

self.onmessage = async (e: MessageEvent<HostEnvelope>) => {
  const { id, req } = e.data;
  try {
    post({ id, type: 'done', result: await handle(id, req) });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    post({ id, type: 'error', message, restart: MODEL_OPS.has(req.op) });
  }
};
