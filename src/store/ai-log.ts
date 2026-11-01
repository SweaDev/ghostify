import { storage } from 'wxt/utils/storage';
import { type AiJob, db, type JobKind, type JobStatus } from './db';

/** Global AI pause (set by the background queue; survives restarts). */
export const aiPaused = storage.defineItem<boolean>('local:aiPaused', { fallback: false });

export const ACTIVE: JobStatus[] = ['queued', 'running', 'paused'];
export const isActive = (j: Pick<AiJob, 'status'>) => ACTIVE.includes(j.status);

export const JOB_LABELS: Record<JobKind, string> = {
  enrich: 'Summary & tags',
  embed: 'Search index',
  search: 'Semantic search',
  decision: 'Rule check',
  detect: 'Feed detection',
  check: 'Model test',
  digest: 'Summarize content',
  ask: 'Question',
};

/** Newest jobs first. */
export const listJobs = (limit = 300) =>
  db.aiJobs.orderBy('createdAt').reverse().limit(limit).toArray();

/** Deletes finished jobs from the log (active ones stay). */
export async function clearFinished(): Promise<void> {
  await db.aiJobs.filter((j) => !isActive(j)).delete();
}
