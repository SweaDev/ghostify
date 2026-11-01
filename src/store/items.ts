import { db, type GhostDraft, type GhostItem, type ItemState } from './db';

export interface ListQuery {
  state?: ItemState;
  host?: string;
  tag?: string;
  text?: string;
  limit?: number;
}

export const itemKey = (host: string, id: string) => `${host}:${id}`;

/** Stores a ghost item; ghostifying a known item returns it unchanged. */
export async function ghostify(draft: GhostDraft, now = Date.now()): Promise<GhostItem> {
  const key = itemKey(draft.host, draft.id);
  return db.transaction('rw', db.items, async () => {
    const existing = await db.items.get(key);
    if (existing) return existing;
    const item: GhostItem = { ...draft, key, state: 'ghost', createdAt: now, updatedAt: now };
    await db.items.add(item);
    return item;
  });
}

export async function unghost(key: string): Promise<void> {
  await db.transaction('rw', db.items, db.embeddings, async () => {
    await db.items.delete(key);
    await db.embeddings.delete(key);
  });
}

/** Auto-ghostifies an item unless the user rescued it before. Returns null when skipped. */
export async function autoGhostify(draft: GhostDraft, now = Date.now()): Promise<GhostItem | null> {
  if (await db.kept.get(itemKey(draft.host, draft.id))) return null;
  return ghostify(draft, now);
}

/** "Not this": unghosts an auto-ghostified item and stops rules from ghostifying it again. */
export async function rescue(key: string): Promise<void> {
  await unghost(key);
  await db.kept.put({ key, at: Date.now() });
}

export async function getItem(key: string): Promise<GhostItem | undefined> {
  return db.items.get(key);
}

export async function updateItem(key: string, patch: Partial<GhostItem>): Promise<void> {
  await db.items.update(key, { ...patch, updatedAt: Date.now() });
}

/** Moves an item between tabs. `snoozed` needs `snoozeUntil`. */
export async function setState(
  key: string,
  state: ItemState,
  snoozeUntil?: number,
  now = Date.now(),
): Promise<GhostItem> {
  if (state === 'snoozed' && !(snoozeUntil && snoozeUntil > now)) {
    throw new Error('snoozeUntil must be in the future');
  }
  const n = await db.items.update(key, {
    state,
    snoozeUntil: state === 'snoozed' ? snoozeUntil : undefined,
    returnedAt: undefined,
    updatedAt: now,
  });
  const item = n ? await db.items.get(key) : undefined;
  if (!item) throw new Error(`Unknown item ${key}`);
  return item;
}

/** Brings expired snoozes back to the Ghosted tab. Returns how many came back. */
export async function expireSnoozes(now = Date.now()): Promise<number> {
  return db.items
    .where('snoozeUntil')
    .belowOrEqual(now)
    .and((i) => i.state === 'snoozed')
    .modify((i) => {
      i.state = 'ghost';
      i.returnedAt = now;
      i.updatedAt = now;
      delete i.snoozeUntil;
    });
}

/** The ids (of `ids`) that are ghostified on `host`, in any state. */
export async function ghostedIds(host: string, ids: string[]): Promise<string[]> {
  const found = await db.items.bulkGet(ids.map((id) => itemKey(host, id)));
  return ids.filter((_, i) => found[i]);
}

function matchesText(item: GhostItem, text: string): boolean {
  const hay = [item.title, item.excerpt, item.author, item.summary, ...(item.tags ?? [])]
    .join(' ')
    .toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Items newest first, filtered by state, host, tag and keywords (all words must match). */
export async function listItems(q: ListQuery = {}): Promise<GhostItem[]> {
  const text = q.text?.trim();
  let items = await db.items.orderBy('createdAt').reverse().toArray();
  items = items.filter(
    (i) =>
      (!q.state || i.state === q.state) &&
      (!q.host || i.host === q.host) &&
      (!q.tag || i.tags?.includes(q.tag)) &&
      (!text || matchesText(i, text)),
  );
  return q.limit ? items.slice(0, q.limit) : items;
}

export async function countByState(): Promise<Record<ItemState, number>> {
  const count = (s: ItemState) => db.items.where('state').equals(s).count();
  const [ghost, later, snoozed] = await Promise.all([
    count('ghost'),
    count('later'),
    count('snoozed'),
  ]);
  return { ghost, later, snoozed };
}

/** Distinct hosts that have items, sorted. */
export async function listHosts(): Promise<string[]> {
  return (await db.items.orderBy('host').uniqueKeys()) as string[];
}
