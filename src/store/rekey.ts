import { canonicalUrl, permalinkId } from 'feedgrab';
import type { Site } from '../sites/model';
import { db, type GhostItem, type ItemState } from './db';
import { itemKey } from './items';
import { takeSnapshot } from './snapshots';

/** One stored item whose post link changes under the current rules. */
export interface RekeyMove {
  from: string;
  to: string;
  id: string;
  url: string;
}

/** The query-parameter rules for an item: its feed's own choice, else the site's. */
function rulesFor(site: Site, feedId?: string): { keep?: string[]; drop?: string[] } {
  const feed = feedId
    ? site.profiles.flatMap((e) => e.profile.feeds).find((f) => f.id === feedId)
    : undefined;
  return feed?.permalinkParams ? { keep: feed.permalinkParams } : { drop: site.ignoreParams };
}

/**
 * Items whose saved link the site's current query-parameter rules change. Only items whose id
 * comes from their link move; text-id items and unknown sites are left alone.
 */
export function planRekey(items: GhostItem[], sites: Site[]): RekeyMove[] {
  const byId = new Map(sites.map((s) => [s.id, s]));
  return items.flatMap((item) => {
    const site = byId.get(item.siteId);
    if (!site || !item.url || item.id !== permalinkId(item.url)) return [];
    const { keep, drop } = rulesFor(site, item.feedId);
    const url = canonicalUrl(item.url, item.url, keep, drop);
    if (!url || url === item.url) return [];
    const id = permalinkId(url);
    return [{ from: item.key, to: itemKey(item.host, id), id, url }];
  });
}

/** Movable items per host, for the dashboard banner. */
export async function pendingRekeys(sites: Site[]): Promise<Map<string, RekeyMove[]>> {
  const items = await db.items.filter((i) => !!i.url).toArray();
  const byHost = new Map<string, RekeyMove[]>();
  for (const m of planRekey(items, sites)) {
    const host = m.from.slice(0, m.from.indexOf(':'));
    byHost.set(host, [...(byHost.get(host) ?? []), m]);
  }
  return byHost;
}

const ACTIVE: Record<ItemState, number> = { ghost: 0, later: 1, snoozed: 2 };

/** One item from two that now share a key: the earlier one, the more active state, all tags. */
export function mergeItems(a: GhostItem, b: GhostItem): GhostItem {
  const [base, other] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
  const active = ACTIVE[other.state] > ACTIVE[base.state] ? other : base;
  const tags = [...new Set([...(base.tags ?? []), ...(other.tags ?? [])])];
  const { snoozeUntil: _, returnedAt: __, ...rest } = base;
  return {
    ...rest,
    state: active.state,
    ...(active.snoozeUntil !== undefined && { snoozeUntil: active.snoozeUntil }),
    ...(active.returnedAt !== undefined && { returnedAt: active.returnedAt }),
    ...(tags.length && { tags }),
    ...(!base.summary && other.summary && { summary: other.summary }),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/**
 * Moves items to the keys their links have under the current rules, after a `before-rekey`
 * snapshot, in one transaction (items, kept, embeddings, contents and AI job links). Returns
 * how many items moved.
 */
export async function applyRekey(moves: RekeyMove[], now = Date.now()): Promise<number> {
  if (!moves.length) return 0;
  await takeSnapshot('before-rekey', now);
  return db.transaction(
    'rw',
    [db.items, db.kept, db.embeddings, db.contents, db.aiJobs],
    async () => {
      let moved = 0;
      const to = new Map<string, string>();
      for (const m of moves) {
        const item = await db.items.get(m.from);
        if (!item || m.from === m.to) continue;
        const target = await db.items.get(m.to);
        const next = { ...item, key: m.to, id: m.id, url: m.url, updatedAt: now };
        await db.items.delete(m.from);
        await db.items.put(target ? mergeItems(target, next) : next);
        const kept = await db.kept.get(m.from);
        if (kept) {
          const there = await db.kept.get(m.to);
          await db.kept.delete(m.from);
          await db.kept.put({ key: m.to, at: Math.min(kept.at, there?.at ?? kept.at) });
        }
        for (const table of [db.embeddings, db.contents] as const) {
          const row = await table.get(m.from);
          if (!row) continue;
          await table.delete(m.from);
          // biome-ignore lint/suspicious/noExplicitAny: same row shape under a new key
          if (!(await table.get(m.to))) await (table as any).put({ ...row, key: m.to });
        }
        to.set(m.from, m.to);
        moved++;
      }
      await db.aiJobs
        .filter((j) => !!j.itemKey && to.has(j.itemKey))
        .modify((j) => {
          j.itemKey = to.get(j.itemKey as string);
        });
      return moved;
    },
  );
}
