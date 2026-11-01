/**
 * Hosts the in-browser model worker. Chrome opens this page as an offscreen document (the MV3
 * service worker can't start workers); Firefox's background page embeds it as an iframe.
 * It only relays messages, and ends the worker after a while without requests to free memory.
 */
import {
  FRAME_MESSAGE,
  type HostEnvelope,
  type HostEvent,
  PORT_NAME,
} from '@/src/ai/browser/protocol';

const IDLE_MS = 10 * 60_000;
let worker: Worker | undefined;
let send: ((e: HostEvent) => void) | undefined;
const inflight = new Set<string>();
let idle: ReturnType<typeof setTimeout> | undefined;

function armIdle() {
  clearTimeout(idle);
  if (inflight.size) return;
  idle = setTimeout(() => {
    worker?.terminate();
    worker = undefined;
    // Chrome: closing the offscreen document disconnects the background, which reopens it later.
    if (window.parent === window) window.close();
  }, IDLE_MS);
}

function relay(env: HostEnvelope) {
  if (!worker) {
    worker = new Worker(new URL('../../src/ai/browser/worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<HostEvent>) => {
      if (e.data.type === 'done' || e.data.type === 'error') {
        inflight.delete(e.data.id);
        armIdle();
      }
      send?.(e.data);
    };
    worker.onerror = (e) => {
      for (const id of inflight)
        send?.({ id, type: 'error', message: e.message || 'AI worker crashed' });
      inflight.clear();
      worker = undefined;
    };
  }
  if (env.req.op !== 'abort') inflight.add(env.id);
  clearTimeout(idle);
  worker.postMessage(env);
}

// Chrome: the background connects with a runtime port.
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  send = (e) => port.postMessage(e);
  port.onMessage.addListener((m) => relay(m as HostEnvelope));
});

// Firefox: the background page hands this iframe a MessageChannel port.
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.type !== FRAME_MESSAGE || !e.ports[0]) return;
  const port = e.ports[0];
  send = (ev) => port.postMessage(ev);
  port.onmessage = (m) => relay(m.data as HostEnvelope);
});

armIdle();
