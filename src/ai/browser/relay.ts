import type { HostEnvelope, HostEvent } from './protocol';

const IDLE_MS = 10 * 60_000;

export interface RelayOptions {
  spawn(): Worker;
  /** Sends a worker event to the background. */
  emit(e: HostEvent): void;
  /** The worker ended after a while without requests. */
  onIdle(): void;
  idleMs?: number;
}

/**
 * Relays requests to the model worker, starting it on demand and ending it when idle. A worker
 * whose model load or run failed is replaced: Transformers.js 4.x queues session loads and runs on
 * one promise that stays rejected after a failure, so every later model in that worker would fail
 * with the same error (huggingface/transformers.js#1767). A fresh worker starts a clean queue.
 */
export function createRelay(o: RelayOptions): (env: HostEnvelope) => void {
  let worker: Worker | undefined;
  const inflight = new Set<string>();
  let idle: ReturnType<typeof setTimeout> | undefined;

  /** Ends the worker, failing what it was still doing. */
  const stop = (message: string) => {
    worker?.terminate();
    worker = undefined;
    for (const id of inflight) o.emit({ id, type: 'error', message });
    inflight.clear();
  };

  const armIdle = () => {
    clearTimeout(idle);
    if (inflight.size) return;
    idle = setTimeout(() => {
      stop('The in-browser AI stopped');
      o.onIdle();
    }, o.idleMs ?? IDLE_MS);
  };

  const start = () => {
    const w = o.spawn();
    w.onmessage = (e: MessageEvent<HostEvent>) => {
      if (w !== worker) return;
      const ev = e.data;
      if (ev.type !== 'done' && ev.type !== 'error') return o.emit(ev);
      inflight.delete(ev.id);
      o.emit(ev);
      if (ev.type === 'error' && ev.restart)
        stop('The in-browser AI restarted after another request failed. Try again.');
      armIdle();
    };
    w.onerror = (e) => {
      if (w !== worker) return;
      stop(e.message || 'AI worker crashed');
      armIdle();
    };
    return w;
  };

  armIdle();
  return (env) => {
    worker ??= start();
    if (env.req.op !== 'abort') inflight.add(env.id);
    clearTimeout(idle);
    worker.postMessage(env);
  };
}
