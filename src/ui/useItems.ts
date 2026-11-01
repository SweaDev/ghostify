import { useLiveQuery } from 'dexie-react-hooks';
import type { GhostItem } from '../store/db';
import { countByState, type ListQuery, listItems } from '../store/items';

/** Live list of items (updates when any context writes to the DB). `undefined` while loading. */
export function useItems(q: ListQuery): GhostItem[] | undefined {
  return useLiveQuery(() => listItems(q), [q.state, q.host, q.tag, q.text, q.limit]);
}

export function useCounts() {
  return useLiveQuery(countByState, []);
}
