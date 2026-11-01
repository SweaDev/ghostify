import {
  JobStopped,
  pauseAll,
  pauseJob,
  resumeAll,
  resumeJob,
  runJob,
  stopAll,
  stopJob,
  whenIdle,
} from '@/src/background/ai-queue';
import { aiPaused } from '@/src/store/ai-log';
import { db } from '@/src/store/db';

const tick = () => new Promise((r) => setTimeout(r, 10));
const status = async (id: string) => (await db.aiJobs.get(id))?.status;

/** A job that resolves when released, or rejects when aborted. */
function gate() {
  let release!: (v: string) => void;
  let runs = 0;
  const task = ({ signal }: { signal: AbortSignal }) =>
    new Promise<string>((res, rej) => {
      runs++;
      release = res;
      signal.addEventListener('abort', () => rej(signal.reason));
    });
  return { task, release: (v: string) => release(v), runs: () => runs };
}

beforeEach(async () => {
  await stopAll();
  await resumeAll();
  await db.aiJobs.clear();
});

describe('ai queue', () => {
  it('runs jobs one at a time and logs them', async () => {
    const a = gate();
    const pa = runJob({ id: 'a', kind: 'enrich', label: 'A' }, a.task);
    const pb = runJob({ id: 'b', kind: 'embed', label: 'B' }, async () => 'b');
    await tick();
    expect(await status('a')).toBe('running');
    expect(await status('b')).toBe('queued');
    a.release('a');
    expect(await Promise.all([pa, pb])).toEqual(['a', 'b']);
    await tick();
    expect(await db.aiJobs.get('b')).toMatchObject({ status: 'done', label: 'B' });
  });

  it('runs high-priority jobs first', async () => {
    const a = gate();
    const order: string[] = [];
    const p = [
      runJob({ id: 'a', kind: 'enrich', label: 'A' }, a.task),
      runJob({ kind: 'embed', label: 'B' }, async () => void order.push('b')),
      runJob({ kind: 'search', label: 'S', high: true }, async () => void order.push('s')),
    ];
    await tick();
    a.release('a');
    await Promise.all(p);
    expect(order).toEqual(['s', 'b']);
  });

  it('pauses, resumes and stops a single job', async () => {
    const a = gate();
    const pa = runJob({ id: 'a', kind: 'digest', label: 'A' }, a.task);
    await tick();
    await pauseJob('a');
    await tick();
    expect(await status('a')).toBe('paused');
    await whenIdle(); // paused jobs don't block idle
    await resumeJob('a');
    await tick();
    expect(a.runs()).toBe(2); // restarted from the beginning
    a.release('done');
    expect(await pa).toBe('done');

    const pb = runJob({ id: 'b', kind: 'digest', label: 'B' }, gate().task);
    await tick();
    await stopJob('b');
    await expect(pb).rejects.toBeInstanceOf(JobStopped);
    await tick();
    expect(await status('b')).toBe('stopped');
  });

  it('pausing all requeues the running job and stops jobs a caller waits on', async () => {
    const a = gate();
    const pa = runJob({ id: 'a', kind: 'enrich', label: 'A' }, a.task);
    const pd = runJob({ id: 'd', kind: 'decision', label: 'D', pausable: false }, gate().task);
    pd.catch(() => {});
    await tick();
    await pauseAll();
    expect(await aiPaused.getValue()).toBe(true);
    await expect(pd).rejects.toBeInstanceOf(JobStopped);
    await expect(
      runJob({ kind: 'search', label: 'S', failIfPaused: true }, async () => 1),
    ).rejects.toThrow('AI is paused');
    await tick();
    expect(await status('a')).toBe('queued');
    await resumeAll();
    await tick();
    a.release('ok');
    expect(await pa).toBe('ok');
  });

  it('stops everything', async () => {
    const p = [
      runJob({ kind: 'enrich', label: 'A' }, gate().task),
      runJob({ kind: 'enrich', label: 'B' }, gate().task),
    ].map((x) => x.catch((e) => e));
    await tick();
    await stopAll();
    for (const x of p) expect(await x).toBeInstanceOf(JobStopped);
    await tick();
    expect((await db.aiJobs.toArray()).map((j) => j.status)).toEqual(['stopped', 'stopped']);
  });

  it('logs failures with their message', async () => {
    await expect(
      runJob({ id: 'f', kind: 'check', label: 'F' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await tick();
    expect(await db.aiJobs.get('f')).toMatchObject({ status: 'failed', error: 'boom' });
  });
});
