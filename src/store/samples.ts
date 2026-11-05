import { db, type SampleRow } from './db';

/** Samples are refreshed from the live page after this long. */
export const SAMPLE_MAX_AGE = 30 * 24 * 3600 * 1000;
/** Largest sample accepted (feedgrab is asked for 20 KB). */
export const SAMPLE_MAX_CHARS = 24000;

const key = (siteId: string, feedId: string) => `${siteId}|${feedId}`;

export const getSamples = (siteId: string) => db.samples.where('siteId').equals(siteId).toArray();

export async function saveSample(s: Omit<SampleRow, 'key' | 'capturedAt'>): Promise<void> {
  await db.samples.put({ ...s, key: key(s.siteId, s.feedId), capturedAt: Date.now() });
}

/** Feed ids (of `feedIds`) with no sample or an old one. */
export async function samplesNeeded(siteId: string, feedIds: string[], now = Date.now()) {
  const rows = await db.samples.bulkGet(feedIds.map((f) => key(siteId, f)));
  return feedIds.filter((_, i) => {
    const r = rows[i];
    return !r || now - r.capturedAt > SAMPLE_MAX_AGE;
  });
}

/** Keeps samples with feeds whose ids changed in an edit. */
export async function renameSamples(siteId: string, renamed: Record<string, string>) {
  await db.transaction('rw', db.samples, async () => {
    for (const [from, to] of Object.entries(renamed)) {
      const r = await db.samples.get(key(siteId, from));
      if (!r) continue;
      await db.samples.delete(r.key);
      await db.samples.put({ ...r, key: key(siteId, to), feedId: to });
    }
  });
}

export async function deleteSamples(siteId: string, feedIds?: string[]) {
  if (feedIds) await db.samples.bulkDelete(feedIds.map((f) => key(siteId, f)));
  else await db.samples.where('siteId').equals(siteId).delete();
}
