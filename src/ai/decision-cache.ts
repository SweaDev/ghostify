import type { ClassifyRequest, ClassifyResponse } from 'feedgrab';
import { db } from '../store/db';

type Result = ClassifyResponse['results'][number];

/** How long a cached answer is reused. Feed items rarely change text; rules invalidate by key. */
export const DECISION_TTL = 30 * 24 * 3_600_000;
let lastPrune = 0;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Answers a classify request from cache, sending only uncached items to `run`. An answer is keyed
 * by the model, the rules (in order, since results point at a rule index) and the item text, so a
 * changed model or rule list asks again.
 */
export async function cachedClassify(
  model: string,
  req: ClassifyRequest,
  run: (req: ClassifyRequest) => Promise<ClassifyResponse>,
): Promise<ClassifyResponse> {
  const keys = await Promise.all(
    req.items.map((it) => sha256(JSON.stringify([model, req.criteria, it.text]))),
  );
  const now = Date.now();
  const hits = await db.decisions.bulkGet(keys);
  const fresh = (i: number) => {
    const h = hits[i];
    return h && now - h.at < DECISION_TTL ? h : undefined;
  };
  const missing = req.items.filter((_, i) => !fresh(i));
  const answered = new Map<string, Result>();
  if (missing.length) {
    const res = await run({ ...req, items: missing });
    for (const r of res.results) answered.set(r.id, r);
    const rows = req.items.flatMap((it, i) => {
      const r = !fresh(i) && answered.get(it.id);
      if (!r) return [];
      const { id: _, ...answer } = r;
      return [{ key: keys[i] as string, at: now, answer }];
    });
    await db.decisions.bulkPut(rows);
  }
  if (now - lastPrune > 3_600_000) {
    lastPrune = now;
    await db.decisions
      .where('at')
      .below(now - DECISION_TTL)
      .delete();
  }
  return {
    results: req.items.flatMap((it, i) => {
      const h = fresh(i);
      const r = h ? { id: it.id, ...h.answer } : answered.get(it.id);
      return r ? [r] : [];
    }),
  };
}
