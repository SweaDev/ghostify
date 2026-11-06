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
import { createRelay } from '@/src/ai/browser/relay';

let send: ((e: HostEvent) => void) | undefined;

const relay = createRelay({
  spawn: () =>
    new Worker(new URL('../../src/ai/browser/worker.ts', import.meta.url), { type: 'module' }),
  emit: (e) => send?.(e),
  // Chrome: closing the offscreen document disconnects the background, which reopens it later.
  onIdle: () => {
    if (window.parent === window) window.close();
  },
});

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
