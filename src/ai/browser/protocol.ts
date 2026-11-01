import type { Spec } from './catalog';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Requests from the background to the model worker (relayed by `offscreen.html`). */
export type HostRequest =
  | { op: 'ping' }
  /** Loads a model; `download` allows fetching its files (otherwise only the cache is used). */
  | { op: 'load'; spec: Spec; download?: boolean }
  | { op: 'embed'; spec: Spec; texts: string[] }
  | {
      op: 'generate';
      spec: Spec;
      messages: ChatMessage[];
      maxNewTokens: number;
      temperature?: number;
      /** Start of the reply to continue from (e.g. `{"summary":` to keep small models on JSON). */
      prefix?: string;
    }
  | { op: 'classify'; spec: Spec; text: string; labels: string[]; template: string }
  | { op: 'abort'; target: string }
  | { op: 'unload'; model: string };

export interface HostEnvelope {
  id: string;
  req: HostRequest;
}

export type HostEvent =
  | { id: string; type: 'progress'; loaded: number; total: number }
  | { id: string; type: 'delta'; text: string }
  | { id: string; type: 'done'; result: unknown }
  | { id: string; type: 'error'; message: string };

export interface LoadResult {
  bytes: number;
}

export interface GenerateResult {
  text: string;
  outputTokens: number;
  finish: 'stop' | 'length' | 'interrupted';
}

/** Scores (0..1) in the order of the requested labels. */
export interface ClassifyResult {
  scores: number[];
}

export const PORT_NAME = 'ghostify-ai';
export const FRAME_MESSAGE = 'ghostify-ai-port';
