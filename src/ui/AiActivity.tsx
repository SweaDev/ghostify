import { ChevronRight, Loader2, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { clearFinished, isActive, JOB_LABELS } from '../store/ai-log';
import type { AiJob, JobStatus } from '../store/db';
import { timeAgo } from './format';
import { btn, btnQuiet } from './kit';
import { allAction, jobAction, useAiPaused, useJobs } from './useAi';

type Filter = 'all' | 'active' | 'done' | 'failed';
const FILTERS: { key: Filter; label: string; match(s: JobStatus): boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'active',
    label: 'Active',
    match: (s) => s === 'queued' || s === 'running' || s === 'paused',
  },
  { key: 'done', label: 'Done', match: (s) => s === 'done' },
  { key: 'failed', label: 'Failed / stopped', match: (s) => s === 'failed' || s === 'stopped' },
];

const STATUS: Record<JobStatus, string> = {
  queued: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  running: 'bg-ghost-100 text-ghost-700 dark:bg-ghost-900/60 dark:text-ghost-200',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  failed: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  stopped: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

function duration(j: AiJob, now: number): string | undefined {
  if (!j.startedAt) return undefined;
  const ms = (j.finishedAt ?? now) - j.startedAt;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function Mini(props: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {props.children}
    </button>
  );
}

/** Pause / resume / stop for one job. */
export function JobControls(props: { job: AiJob; showStop?: boolean }) {
  const j = props.job;
  if (!isActive(j)) return null;
  return (
    <span className="inline-flex items-center">
      {j.status === 'paused' ? (
        <Mini label="Resume" onClick={() => jobAction(j.id, 'resume')}>
          <Play className="size-3.5" />
        </Mini>
      ) : (
        j.pausable && (
          <Mini label="Pause" onClick={() => jobAction(j.id, 'pause')}>
            <Pause className="size-3.5" />
          </Mini>
        )
      )}
      {props.showStop !== false && (
        <Mini label="Stop" onClick={() => jobAction(j.id, 'stop')}>
          <Square className="size-3.5" />
        </Mini>
      )}
    </span>
  );
}

function Detail(props: { label: string; text?: string }) {
  if (!props.text) return null;
  return (
    <div>
      <div className="mb-0.5 font-medium text-[11px] text-zinc-500 uppercase tracking-wide">
        {props.label}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-2 font-mono text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
        {props.text}
      </pre>
    </div>
  );
}

function JobRow(props: { job: AiJob; now: number }) {
  const { job: j, now } = props;
  const [open, setOpen] = useState(false);
  return (
    <li className="border-zinc-100 border-b last:border-0 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-1 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${JOB_LABELS[j.kind]}: ${j.label}`}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 text-zinc-400 transition ${open ? 'rotate-90' : ''}`}
          />
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px] ${STATUS[j.status]}`}
          >
            {j.status === 'running' && <Loader2 className="size-3 animate-spin" />}
            {j.status}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              <span className="font-medium">{JOB_LABELS[j.kind]}</span>
              <span className="text-zinc-500"> · {j.label}</span>
            </span>
            <span className="block truncate text-[11px] text-zinc-500">
              {[j.model, timeAgo(j.createdAt, now), duration(j, now)].filter(Boolean).join(' · ')}
              {j.error && <span className="text-rose-600 dark:text-rose-400"> · {j.error}</span>}
            </span>
          </span>
        </button>
        <JobControls job={j} />
      </div>
      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-7">
          <Detail label="System prompt" text={j.system} />
          <Detail label="Input" text={j.input} />
          <Detail label="Output" text={j.output} />
          {j.error && <Detail label="Error" text={j.error} />}
          {!j.system && !j.input && !j.output && !j.error && (
            <p className="text-xs text-zinc-500">No details recorded yet.</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Everything the AI did or is doing, with pause / resume / stop per job and for all. */
export function AiActivity(props: { compact?: boolean }) {
  const jobs = useJobs();
  const paused = useAiPaused();
  const [filter, setFilter] = useState<Filter>('all');
  const now = Date.now();
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const shown = jobs?.filter((j) => f?.match(j.status));
  const active = jobs?.filter(isActive) ?? [];
  const running = active.find((j) => j.status === 'running');

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl p-3 ${
          paused
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
            : 'bg-zinc-50 dark:bg-zinc-900'
        }`}
      >
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">
            {paused ? 'AI is paused' : running ? 'AI is working' : 'AI is idle'}
          </div>
          <div className="truncate text-xs opacity-80">
            {paused
              ? 'Nothing new starts until you resume. Searches use keywords meanwhile.'
              : running
                ? `${JOB_LABELS[running.kind]}: ${running.label}`
                : 'New jobs start right away.'}
            {active.length > 1 && ` · ${active.length - (running ? 1 : 0)} waiting`}
          </div>
        </div>
        {paused ? (
          <button type="button" className={btn} onClick={() => allAction('resume')}>
            <Play className="size-4" /> Resume all
          </button>
        ) : (
          <button type="button" className={btn} onClick={() => allAction('pause')}>
            <Pause className="size-4" /> Pause all
          </button>
        )}
        <button
          type="button"
          className={btn}
          disabled={!active.length}
          onClick={() => allAction('stop')}
        >
          <Square className="size-4" /> Stop all
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={filter === x.key}
            onClick={() => setFilter(x.key)}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              filter === x.key
                ? 'bg-ghost-500 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            {x.label}
            {x.key === 'active' && active.length > 0 && ` (${active.length})`}
          </button>
        ))}
        <button
          type="button"
          className={`${btnQuiet} ml-auto px-2 text-xs`}
          onClick={() => void clearFinished()}
        >
          <Trash2 className="size-3.5" /> Clear finished
        </button>
      </div>

      <ul className={`min-h-0 overflow-y-auto ${props.compact ? '' : 'max-h-[60vh]'}`}>
        {shown?.map((j) => (
          <JobRow key={j.id} job={j} now={now} />
        ))}
        {shown?.length === 0 && (
          <li className="py-8 text-center text-sm text-zinc-500">
            {filter === 'all'
              ? 'No AI activity yet. Summaries, tags, indexing, rule checks and questions show up here.'
              : 'Nothing here.'}
          </li>
        )}
      </ul>
    </div>
  );
}
