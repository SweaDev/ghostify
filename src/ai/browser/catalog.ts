import type { Purpose } from '../../store/settings';

/** Where in-browser models run: CPU (WebAssembly, works everywhere) or GPU (WebGPU). */
export type Device = 'wasm' | 'webgpu';
export type Task = 'feature-extraction' | 'text-generation' | 'zero-shot-classification';

export interface BrowserModel {
  id: string;
  label: string;
  purpose: Purpose;
  /** Weight precision per device (Transformers.js `dtype`). */
  dtype: Record<Device, string>;
  /** Approximate download size in MB per device. */
  mb?: Record<Device, number>;
  hint?: string;
  /** Embeddings: how token vectors become one vector. */
  pooling?: 'mean' | 'cls';
}

export const TASKS: Record<Purpose, Task> = {
  embedding: 'feature-extraction',
  general: 'text-generation',
  decision: 'zero-shot-classification',
};

/** Small ONNX models that run on a laptop CPU. Downloaded from Hugging Face on request. */
export const BROWSER_MODELS: BrowserModel[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'MiniLM L6',
    purpose: 'embedding',
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    mb: { wasm: 23, webgpu: 45 },
    hint: 'Fast English search',
    pooling: 'mean',
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    label: 'BGE small',
    purpose: 'embedding',
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    mb: { wasm: 34, webgpu: 65 },
    hint: 'Better English search',
    pooling: 'cls',
  },
  {
    id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    label: 'Multilingual MiniLM L12',
    purpose: 'embedding',
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    mb: { wasm: 118, webgpu: 230 },
    hint: '50+ languages',
    pooling: 'mean',
  },
  {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M',
    purpose: 'general',
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    mb: { wasm: 350, webgpu: 265 },
    hint: 'Summaries and tags on most laptops',
  },
  {
    id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    label: 'SmolLM2 135M',
    purpose: 'general',
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    mb: { wasm: 135, webgpu: 115 },
    hint: 'For low-memory computers; plainer summaries',
  },
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    label: 'Gemma 3 270M',
    purpose: 'general',
    dtype: { wasm: 'q4', webgpu: 'q4f16' },
    mb: { wasm: 315, webgpu: 265 },
    hint: 'Multilingual, tiny',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5 0.5B',
    purpose: 'general',
    dtype: { wasm: 'q8', webgpu: 'q4f16' },
    mb: { wasm: 495, webgpu: 465 },
    hint: 'Best answers, slower',
  },
  {
    id: 'Xenova/nli-deberta-v3-xsmall',
    label: 'DeBERTa v3 xsmall NLI',
    purpose: 'decision',
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    mb: { wasm: 85, webgpu: 140 },
    hint: 'Accurate rule checks',
  },
  {
    id: 'Xenova/mobilebert-uncased-mnli',
    label: 'MobileBERT MNLI',
    purpose: 'decision',
    dtype: { wasm: 'q8', webgpu: 'fp16' },
    mb: { wasm: 26, webgpu: 48 },
    hint: 'Smallest rule checker',
  },
];

export const DEFAULT_BROWSER: Record<Purpose, string> = {
  embedding: 'Xenova/all-MiniLM-L6-v2',
  general: 'HuggingFaceTB/SmolLM2-360M-Instruct',
  decision: 'Xenova/nli-deberta-v3-xsmall',
};

/** `owner/name` of a Hugging Face repo. */
export const MODEL_ID = /^[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*$/i;

export const browserModels = (purpose: Purpose) =>
  BROWSER_MODELS.filter((m) => m.purpose === purpose);

/** A catalog entry, or a generic one for any typed Hugging Face ONNX repo. */
export function browserModel(id: string, purpose: Purpose): BrowserModel {
  const known = BROWSER_MODELS.find((m) => m.id === id && m.purpose === purpose);
  if (known) return known;
  return {
    id,
    label: id,
    purpose,
    dtype: purpose === 'general' ? { wasm: 'q4', webgpu: 'q4f16' } : { wasm: 'q8', webgpu: 'fp16' },
    pooling: purpose === 'embedding' ? 'mean' : undefined,
  };
}

/** Everything the worker needs to load a model. */
export interface Spec {
  model: string;
  task: Task;
  dtype: string;
  device: Device;
  pooling?: 'mean' | 'cls';
}

export function specFor(id: string, purpose: Purpose, device: Device): Spec {
  if (!MODEL_ID.test(id)) throw new Error(`"${id}" is not a Hugging Face model id (owner/name)`);
  const m = browserModel(id, purpose);
  return { model: id, task: TASKS[purpose], dtype: m.dtype[device], device, pooling: m.pooling };
}

/** Downloads are tracked per model and precision (each precision is a different file). */
export const specKey = (s: Pick<Spec, 'model' | 'dtype'>) => `${s.model}@${s.dtype}`;
