import { aiPaused } from '../store/ai-log';
import { type AiJob, db, type JobKind } from '../store/db';

export interface JobMeta {
  /** Set by callers that link to the log entry before the job runs. */
  id?: string;
  kind: JobKind;
  label: string;
  itemKey?: string;
  model?: string;
  system?: string;
  input?: string;
  /** Default true. Non-pausable jobs (a caller is waiting) are stopped instead of paused. */
  pausable?: boolean;
  /** Runs before normal jobs (searches, rule checks, tests, questions). */
  high?: boolean;
  /** Rejects at once when AI is paused instead of waiting. */
  failIfPaused?: boolean;
}

export interface JobCtx {
  signal: AbortSignal;
  /** Updates the log entry (throttled), e.g. with streamed output. */
  update(patch: Partial<Pick<AiJob, 'output' | 'input' | 'system' | 'model'>>): void;
}

export class JobStopped extends Error {
  override name = 'AbortError';
  constructor(message = 'Stopped') {
    super(message);
  }
}

interface Entry {
  rec: AiJob;
  high: boolean;
  task(ctx: JobCtx): Promise<unknown>;
  resolve(v: unknown): void;
  reject(e: unknown): void;
  ctl?: AbortController;
  /** Why the running task was aborted. */
  why?: 'pause' | 'requeue' | 'stop';
  /** A throttled log write is pending. */
  saving?: boolean;
}

const LOG_LIMIT = 300;
const MAX_TEXT = 4000;
const BOOT = Date.now();
const clip = (s?: string) => (s && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

const queue: Entry[] = [];
let active: Entry | undefined;
let paused = false;
let ready: Promise<void> = Promise.resolve();
let waiters: (() => void)[] = [];

const idle = () => !paused && !active && !queue.some((e) => e.rec.status === 'queued');

function notify() {
  if (!idle()) return;
  const w = waiters;
  waiters = [];
  for (const r of w) r();
}

const save = (rec: AiJob) => db.aiJobs.put({ ...rec }).catch(() => {});

async function prune() {
  if ((await db.aiJobs.count()) <= LOG_LIMIT + 50) return;
  const old = await db.aiJobs.orderBy('createdAt').reverse().offset(LOG_LIMIT).toArray();
  await db.aiJobs.bulkDelete(old.filter((j) => j.finishedAt).map((j) => j.id));
}

function finish(e: Entry, status: AiJob['status'], error?: string) {
  Object.assign(e.rec, { status, error, finishedAt: Date.now() });
  void save(e.rec).then(prune);
}

function insert(e: Entry, front = false) {
  if (front) return void queue.unshift(e);
  const i = e.high ? queue.findIndex((q) => !q.high) : -1;
  if (i === -1) queue.push(e);
  else queue.splice(i, 0, e);
}

async function pump(): Promise<void> {
  await ready;
  if (active || paused) return notify();
  const i = queue.findIndex((e) => e.rec.status === 'queued');
  const e = queue[i];
  if (!e) return notify();
  queue.splice(i, 1);
  active = e;
  e.ctl = new AbortController();
  Object.assign(e.rec, { status: 'running', startedAt: Date.now(), error: undefined });
  void save(e.rec);
  const update: JobCtx['update'] = (patch) => {
    Object.assign(e.rec, patch, { output: clip(patch.output ?? e.rec.output) });
    if (e.saving) return;
    e.saving = true;
    setTimeout(() => {
      e.saving = false;
      if (active === e) void save(e.rec);
    }, 250);
  };
  try {
    const v = await e.task({ signal: e.ctl.signal, update });
    finish(e, 'done');
    e.resolve(v);
  } catch (err) {
    const why = e.why;
    e.why = undefined;
    if (why === 'pause' || why === 'requeue') {
      Object.assign(e.rec, { status: why === 'pause' ? 'paused' : 'queued' });
      void save(e.rec);
      insert(e, true);
    } else if (why === 'stop') {
      finish(e, 'stopped');
      e.reject(new JobStopped());
    } else {
      finish(e, 'failed', (err as Error)?.message ?? String(err));
      e.reject(err);
    }
  } finally {
    active = undefined;
    void pump();
  }
}

/** Runs AI jobs one at a time (a local model is never flooded), logging each in `db.aiJobs`. */
export function runJob<T>(meta: JobMeta, task: (ctx: JobCtx) => Promise<T>): Promise<T> {
  return ready.then(
    () =>
      new Promise<T>((resolve, reject) => {
        const rec: AiJob = {
          id: meta.id ?? crypto.randomUUID(),
          kind: meta.kind,
          label: meta.label,
          itemKey: meta.itemKey,
          model: meta.model,
          system: clip(meta.system),
          input: clip(meta.input),
          pausable: meta.pausable ?? true,
          status: 'queued',
          createdAt: Date.now(),
        };
        if (meta.failIfPaused && paused) {
          void save({ ...rec, status: 'stopped', error: 'AI is paused', finishedAt: Date.now() });
          return reject(new JobStopped('AI is paused'));
        }
        insert({ rec, high: !!meta.high, task, resolve: resolve as (v: unknown) => void, reject });
        void save(rec);
        void pump();
      }),
  );
}

/** Like `runJob`, but errors are logged instead of thrown. */
export const enqueue = (meta: JobMeta, task: (ctx: JobCtx) => Promise<unknown>): Promise<void> =>
  runJob(meta, task).then(
    () => {},
    (e) => {
      if (!(e instanceof JobStopped)) console.warn('[ghostify:ai]', e);
    },
  );

/** Resolves once AI is not paused and no job is queued or running (paused jobs don't count). */
export function whenIdle(): Promise<void> {
  if (idle()) return Promise.resolve();
  return new Promise((r) => waiters.push(r));
}

export const isPaused = () => paused;

const find = (id: string) => (active?.rec.id === id ? active : queue.find((e) => e.rec.id === id));

function abort(e: Entry, why: Entry['why']) {
  e.why = why;
  e.ctl?.abort(new JobStopped(why === 'stop' ? 'Stopped' : 'Paused'));
}

function stopQueued(e: Entry) {
  queue.splice(queue.indexOf(e), 1);
  finish(e, 'stopped');
  e.reject(new JobStopped());
}

export async function stopJob(id: string): Promise<void> {
  const e = find(id);
  if (e === active && e) abort(e, 'stop');
  else if (e) stopQueued(e);
  else {
    // A job from before the background restarted: just close its log entry.
    const rec = await db.aiJobs.get(id);
    if (rec && !rec.finishedAt)
      await db.aiJobs.update(id, { status: 'stopped', finishedAt: Date.now() });
  }
  notify();
}

export async function pauseJob(id: string): Promise<void> {
  const e = find(id);
  if (!e) return;
  if (!e.rec.pausable) return stopJob(id);
  if (e === active) abort(e, 'pause');
  else if (e.rec.status === 'queued') {
    e.rec.status = 'paused';
    void save(e.rec);
  }
  notify();
}

export async function resumeJob(id: string): Promise<void> {
  const e = queue.find((q) => q.rec.id === id);
  if (e?.rec.status !== 'paused') return;
  e.rec.status = 'queued';
  void save(e.rec);
  void pump();
}

/** Pauses all AI work: the running job goes back to the queue, callers waiting on a job are told it stopped. */
export async function pauseAll(): Promise<void> {
  paused = true;
  await aiPaused.setValue(true);
  for (const e of queue.filter((q) => !q.rec.pausable)) stopQueued(e);
  if (active) abort(active, active.rec.pausable ? 'requeue' : 'stop');
}

/** Lifts the global pause and resumes individually paused jobs too. */
export async function resumeAll(): Promise<void> {
  paused = false;
  await aiPaused.setValue(false);
  for (const e of queue.filter((q) => q.rec.status === 'paused')) {
    e.rec.status = 'queued';
    void save(e.rec);
  }
  void pump();
}

/** Stops every queued, paused and running job (the pause setting is unchanged). */
export async function stopAll(): Promise<void> {
  for (const e of [...queue]) stopQueued(e);
  if (active) abort(active, 'stop');
  await db.aiJobs
    .filter((j) => !j.finishedAt && j.createdAt < BOOT)
    .modify({ status: 'stopped', finishedAt: Date.now() });
  notify();
}

/** Loads the pause setting and closes log entries left open by a previous background run. */
export function initQueue(): Promise<void> {
  ready = (async () => {
    paused = await aiPaused.getValue();
    await db.aiJobs
      .filter((j) => !j.finishedAt && j.createdAt < BOOT)
      .modify({
        status: 'stopped',
        finishedAt: Date.now(),
        error: 'Interrupted (the background restarted)',
      });
  })().catch((e) => console.warn('[ghostify:ai] queue init', e));
  return ready;
}
