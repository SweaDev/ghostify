import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { sendMessage } from '../messaging';
import { aiPaused, isActive, listJobs } from '../store/ai-log';
import { type AiJob, db } from '../store/db';

/** Live AI activity log, newest first. */
export const useJobs = (limit = 300) => useLiveQuery(() => listJobs(limit), [limit]);

/** One job by id (live), e.g. the digest or answer that is streaming. */
export const useJob = (id?: string) =>
  useLiveQuery(() => (id ? db.aiJobs.get(id) : undefined), [id]);

/** Number of queued, running and paused jobs. */
export const useActiveCount = () =>
  useLiveQuery(() => db.aiJobs.where('status').anyOf('queued', 'running', 'paused').count(), []);

export function useAiPaused(): boolean {
  const [p, set] = useState(false);
  useEffect(() => {
    void aiPaused.getValue().then(set);
    return aiPaused.watch((v) => set(!!v));
  }, []);
  return p;
}

export const jobAction = (id: string, action: 'pause' | 'resume' | 'stop') =>
  void sendMessage('aiJob', { id, action });
export const allAction = (action: 'pause' | 'resume' | 'stop') =>
  void sendMessage('aiAll', { action });

export const busy = (j?: AiJob) => !!j && isActive(j);
