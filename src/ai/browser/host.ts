import { browser } from 'wxt/browser';
import {
  FRAME_MESSAGE,
  type HostEnvelope,
  type HostEvent,
  type HostRequest,
  PORT_NAME,
} from './protocol';

/** A connection to the page that runs the model worker. */
export interface Channel {
  post(m: HostEnvelope): void;
  onEvent(cb: (e: HostEvent) => void): void;
  onClose(cb: () => void): void;
}

export interface CallOptions {
  signal?: AbortSignal;
  onProgress?(loaded: number, total: number): void;
  onDelta?(text: string): void;
}

interface Pending extends CallOptions {
  resolve(v: unknown): void;
  reject(e: unknown): void;
}

export class HostClosed extends Error {
  override name = 'HostClosed';
}

/** Sends requests to the model worker and matches its events to them. */
export class BrowserHost {
  private channel?: Promise<Channel>;
  private pending = new Map<string, Pending>();

  constructor(private connect: () => Promise<Channel>) {}

  /** True while a channel is open (used to skip starting the worker just to unload). */
  get open(): boolean {
    return !!this.channel;
  }

  private ensure(): Promise<Channel> {
    this.channel ??= this.connect().then(
      (ch) => {
        ch.onEvent((e) => this.dispatch(e));
        ch.onClose(() => this.closed());
        return ch;
      },
      (e) => {
        this.channel = undefined;
        throw e;
      },
    );
    return this.channel;
  }

  private closed() {
    this.channel = undefined;
    const err = new HostClosed('The in-browser AI stopped (it is restarted on the next request)');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private dispatch(e: HostEvent) {
    const p = this.pending.get(e.id);
    if (!p) return;
    if (e.type === 'progress') p.onProgress?.(e.loaded, e.total);
    else if (e.type === 'delta') p.onDelta?.(e.text);
    else {
      this.pending.delete(e.id);
      if (e.type === 'done') p.resolve(e.result);
      else p.reject(new Error(e.message));
    }
  }

  async call<T>(req: HostRequest, opts: CallOptions = {}): Promise<T> {
    opts.signal?.throwIfAborted();
    const ch = await this.ensure();
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        if (!this.pending.delete(id)) return;
        ch.post({ id: crypto.randomUUID(), req: { op: 'abort', target: id } });
        reject(opts.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const done = <F extends (v: never) => void>(f: F) =>
        ((v: never) => {
          opts.signal?.removeEventListener('abort', onAbort);
          f(v);
        }) as F;
      this.pending.set(id, {
        ...opts,
        resolve: done(resolve as (v: never) => void),
        reject: done(reject),
      });
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      ch.post({ id, req });
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves once the channel answers a ping, so a page that is still loading isn't missed. */
async function ready(ch: Channel, ms = 2000): Promise<Channel> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The AI page did not answer')), ms);
    ch.onEvent((e) => {
      if (e.id === 'ping') {
        clearTimeout(t);
        resolve();
      }
    });
    ch.onClose(() => reject(new Error('The AI page closed')));
    ch.post({ id: 'ping', req: { op: 'ping' } });
  });
  return ch;
}

function portChannel(): Channel {
  const port = browser.runtime.connect({ name: PORT_NAME });
  return {
    post: (m) => port.postMessage(m),
    onEvent: (cb) => port.onMessage.addListener((m) => cb(m as HostEvent)),
    onClose: (cb) => port.onDisconnect.addListener(() => cb()),
  };
}

/** Chrome: an offscreen document (MV3 service workers can't start workers). */
async function offscreenChannel(): Promise<Channel> {
  const contexts = await browser.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!contexts?.length) {
    await browser.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Runs the AI models you downloaded in a web worker, on this device.',
      })
      .catch((e: Error) => {
        if (!/single offscreen/i.test(e.message)) throw e;
      });
  }
  let last: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      return await ready(portChannel(), 1000);
    } catch (e) {
      last = e;
      await sleep(150);
    }
  }
  throw last;
}

/** Firefox: the background is a page, so the host page is embedded as an iframe. */
async function frameChannel(): Promise<Channel> {
  let frame = document.querySelector<HTMLIFrameElement>('iframe[data-ghostify-ai]');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.dataset.ghostifyAi = '';
    frame.src = browser.runtime.getURL('/offscreen.html');
    const loaded = new Promise((r) => frame?.addEventListener('load', r, { once: true }));
    document.body.append(frame);
    await loaded;
  }
  const mc = new MessageChannel();
  frame.contentWindow?.postMessage({ type: FRAME_MESSAGE }, location.origin, [mc.port2]);
  const listeners: ((e: HostEvent) => void)[] = [];
  mc.port1.onmessage = (e) => {
    for (const l of listeners) l(e.data as HostEvent);
  };
  return ready({
    post: (m) => mc.port1.postMessage(m),
    onEvent: (cb) => listeners.push(cb),
    onClose: () => {},
  });
}

/** The model host for this browser. */
export const host = new BrowserHost(() =>
  browser.offscreen ? offscreenChannel() : frameChannel(),
);
