import { specFor, specKey } from '@/src/ai/browser/catalog';
import { gatedFetch } from '@/src/ai/browser/gate';
import { BrowserHost, type Channel } from '@/src/ai/browser/host';
import type { HostEnvelope, HostEvent } from '@/src/ai/browser/protocol';
import { deleteModel, downloadModel, isDownloaded } from '@/src/background/browser-models';
import { downloadedItem, downloadsItem } from '@/src/store/browser-models';

/** A channel whose worker side is `reply` (it gets each request and an emit function). */
function fakeChannel(reply: (m: HostEnvelope, emit: (e: HostEvent) => void) => void) {
  const listeners: ((e: HostEvent) => void)[] = [];
  const closers: (() => void)[] = [];
  const sent: HostEnvelope[] = [];
  const emit = (e: HostEvent) =>
    queueMicrotask(() => {
      for (const l of listeners) l(e);
    });
  const ch: Channel = {
    post: (m) => {
      sent.push(m);
      reply(m, emit);
    },
    onEvent: (cb) => listeners.push(cb),
    onClose: (cb) => closers.push(cb),
  };
  return {
    ch,
    sent,
    close: () => {
      for (const c of closers) c();
    },
  };
}

const spec = specFor('Xenova/all-MiniLM-L6-v2', 'embedding', 'wasm');

describe('browser model catalog', () => {
  it('picks the precision per device and accepts any repo id', () => {
    expect(spec).toMatchObject({ task: 'feature-extraction', dtype: 'q8', pooling: 'mean' });
    expect(specFor('Xenova/all-MiniLM-L6-v2', 'embedding', 'webgpu').dtype).toBe('fp16');
    expect(specFor('acme/tiny-chat', 'general', 'wasm')).toMatchObject({
      task: 'text-generation',
      dtype: 'q4',
    });
    expect(specKey(spec)).toBe('Xenova/all-MiniLM-L6-v2@q8');
    expect(() => specFor('../etc', 'general', 'wasm')).toThrow(/Hugging Face/);
  });
});

describe('fetch gate', () => {
  it('lets only allowed models reach Hugging Face', async () => {
    const base = vi.fn(async () => new Response('ok')) as unknown as typeof fetch;
    const f = gatedFetch(base, new Set(['a/b']));
    await f('https://huggingface.co/a/b/resolve/main/config.json');
    await expect(f('https://huggingface.co/c/d/resolve/main/config.json')).rejects.toThrow(
      /not downloaded/,
    );
    await f('chrome-extension://x/assets/ort.wasm');
    expect(base).toHaveBeenCalledTimes(2);
  });
});

describe('BrowserHost', () => {
  it('matches events to calls: progress, deltas and results', async () => {
    const { ch } = fakeChannel((m, emit) => {
      if (m.req.op !== 'generate') return;
      emit({ id: m.id, type: 'delta', text: 'Hi' });
      emit({ id: m.id, type: 'done', result: { text: 'Hi', outputTokens: 1, finish: 'stop' } });
    });
    const host = new BrowserHost(async () => ch);
    const deltas: string[] = [];
    const r = await host.call(
      { op: 'generate', spec, messages: [], maxNewTokens: 4 },
      { onDelta: (t) => deltas.push(t) },
    );
    expect(r).toEqual({ text: 'Hi', outputTokens: 1, finish: 'stop' });
    expect(deltas).toEqual(['Hi']);
  });

  it('aborts a call (telling the worker) and fails pending calls when the page closes', async () => {
    const { ch, sent, close } = fakeChannel(() => {});
    let connects = 0;
    const host = new BrowserHost(async () => {
      connects++;
      return ch;
    });
    const ctl = new AbortController();
    const p = host.call({ op: 'embed', spec, texts: ['x'] }, { signal: ctl.signal });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    ctl.abort();
    await expect(p).rejects.toThrow();
    expect(sent[1]?.req).toEqual({ op: 'abort', target: sent[0]?.id });

    const q = host.call({ op: 'ping' });
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    close();
    await expect(q).rejects.toThrow(/stopped/);
    expect(host.open).toBe(false);
    void host.call({ op: 'ping' }).catch(() => {});
    await vi.waitFor(() => expect(connects).toBe(2));
  });
});

describe('downloads', () => {
  it('records a finished download and the error of a failed one', async () => {
    const { ch } = fakeChannel((m, emit) => {
      if (m.req.op === 'unload') return emit({ id: m.id, type: 'done', result: null });
      if (m.req.op !== 'load') return;
      if (m.req.spec.model === 'bad/model')
        return emit({ id: m.id, type: 'error', message: 'nope' });
      emit({ id: m.id, type: 'progress', loaded: 5, total: 10 });
      emit({ id: m.id, type: 'done', result: { bytes: 10 } });
    });
    const host = new BrowserHost(async () => ch);
    await downloadModel(spec, host);
    expect(await isDownloaded(spec)).toBe(true);
    expect((await downloadedItem.getValue())[specKey(spec)]?.bytes).toBe(10);
    expect(await downloadsItem.getValue()).toEqual({});

    const bad = specFor('bad/model', 'general', 'wasm');
    await expect(downloadModel(bad, host)).rejects.toThrow('nope');
    expect((await downloadsItem.getValue())[specKey(bad)]?.error).toBe('nope');

    await deleteModel('Xenova/all-MiniLM-L6-v2', host);
    expect(await isDownloaded(spec)).toBe(false);
  });
});
