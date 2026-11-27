import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { db, type GhostItem } from '../store/db';

/** The item's local thumbnail as an object URL (revoked when it changes), else its image URL. */
export function useThumb(item: Pick<GhostItem, 'key' | 'image'>): string | undefined {
  const row = useLiveQuery(() => db.thumbs.get(item.key), [item.key]);
  const url = useMemo(
    () => (row ? URL.createObjectURL(new Blob([row.data], { type: row.type })) : undefined),
    [row],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url ?? item.image;
}
