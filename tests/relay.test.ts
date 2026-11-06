import type { HostEnvelope, HostEvent } from '@/src/ai/browser/protocol';
import { createRelay } from '@/src/ai/browser/relay';

class FakeWorker {
  onmessage: ((e: MessageEvent<HostEvent>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: HostEnvelope[] = [];
  terminated = false;
  postMessage(m: HostEnvelope) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(e: HostEvent) {
    this.onmessage?.({ data: e } as MessageEvent<HostEvent>);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const events: HostEvent[] = [];
  const onIdle = vi.fn();
  const relay = createRelay({
    spawn: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    },
    emit: (e) => events.push(e),
    onIdle,
    idleMs: 1000,
  });
  const spec = { model: 'a/b', task: 'feature-extraction', dtype: 'q8', device: 'wasm' } as const;
  const embed = (id: string): HostEnvelope => ({ id, req: { op: 'embed', spec, texts: ['x'] } });
  return { relay, workers, events, onIdle, embed };
}

afterEach(() => vi.useRealTimers());

describe('model worker relay', () => {
  it('replaces the worker after a failed model request, failing what it still ran', () => {
    const { relay, workers, events, embed } = setup();
    relay(embed('1'));
    relay(embed('2'));
    const [first] = workers;
    first?.reply({ id: '1', type: 'error', message: 'Could not create a session', restart: true });
    expect(first?.terminated).toBe(true);
    expect(events.map((e) => [e.id, e.type])).toEqual([
      ['1', 'error'],
      ['2', 'error'],
    ]);
    expect(events[1]).toMatchObject({ message: /restarted/ });
    // A late event from the old worker is dropped; the next request starts a new worker.
    first?.reply({ id: '2', type: 'done', result: [] });
    relay(embed('3'));
    expect(workers).toHaveLength(2);
    expect(workers[1]?.posted.map((m) => m.id)).toEqual(['3']);
    expect(events).toHaveLength(2);
  });

  it('keeps the worker after other errors and results', () => {
    const { relay, workers, events, embed } = setup();
    relay(embed('1'));
    workers[0]?.reply({ id: '1', type: 'error', message: 'nope' });
    relay(embed('2'));
    workers[0]?.reply({ id: '2', type: 'done', result: [] });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.terminated).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['error', 'done']);
  });

  it('ends the worker once idle, not while a request runs', () => {
    vi.useFakeTimers();
    const { relay, workers, onIdle, embed } = setup();
    relay(embed('1'));
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
    workers[0]?.reply({ id: '1', type: 'done', result: [] });
    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(workers[0]?.terminated).toBe(true);
  });
});
