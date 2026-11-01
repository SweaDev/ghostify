import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { grabContent, requestAccess } from '../feed/reader';
import { type ContentRow, db, type GhostItem } from '../store/db';

export interface Grab {
  content: ContentRow | undefined;
  /** True once the full page content was grabbed. */
  grabbed: boolean;
  busy: boolean;
  error?: string;
  /** Call first thing in a click handler (it may ask for access to the site). */
  grab(): Promise<boolean>;
}

/** An item's grabbed content (live) and a way to grab it. */
export function useContent(item: GhostItem): Grab {
  const content = useLiveQuery(() => db.contents.get(item.key), [item.key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const grab = async () => {
    const url = item.url;
    if (!url) {
      setError('This item has no link to load.');
      return false;
    }
    const allowed = requestAccess(url);
    setBusy(true);
    setError(undefined);
    try {
      if (!(await allowed))
        throw new Error(`Allow access to ${new URL(url).host} to load it here.`);
      await grabContent(item.key, url);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { content, grabbed: !!content?.text, busy, error, grab };
}
