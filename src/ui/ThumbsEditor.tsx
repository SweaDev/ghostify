import { useLiveQuery } from 'dexie-react-hooks';
import { ImageDown, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { backfillThumbs, imageOrigins } from '../background/thumbs';
import type { Site } from '../sites/model';
import { db } from '../store/db';
import { btn } from './kit';

const hostOf = (origin: string) => origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');

/**
 * Thumbnails for one site: Ghostify keeps a small copy of each item's image once it may fetch
 * from the image hosts (asked here, once), so cards still show when the site's links expire.
 */
export function ThumbsEditor({ site }: { site: Site }) {
  const [origins, setOrigins] = useState<string[]>();
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const counts = useLiveQuery(async () => {
    const items = await db.items.filter((i) => i.siteId === site.id && !!i.image).primaryKeys();
    const have = (await db.thumbs.bulkGet(items)).filter(Boolean).length;
    return { items: items.length, have };
  }, [site.id]);

  useEffect(() => {
    let live = true;
    void imageOrigins(site.id).then(async (o) => {
      const ok =
        o.length > 0 && (await browser.permissions.contains({ origins: o }).catch(() => false));
      if (!live) return;
      setOrigins(o);
      setGranted(ok);
    });
    return () => {
      live = false;
    };
  }, [site.id]);

  const fill = async () => {
    setBusy(true);
    const made = await backfillThumbs(site.id);
    setBusy(false);
    setNote(made ? `Saved ${made} thumbnail${made === 1 ? '' : 's'}.` : 'Nothing new to save.');
  };
  const allow = async () => {
    // Ask first thing in the click: browsers only prompt during a user gesture.
    const ok = await browser.permissions.request({ origins: origins ?? [] }).catch(() => false);
    setGranted(ok);
    if (ok) await fill();
    else setNote('Not allowed; cards keep loading images from the site.');
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">Thumbnails</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Ghostify keeps a small copy (up to 64 KB) of each item's image, so cards still show when the
        site's image links expire. Videos, audio and PDFs are never downloaded.
      </p>
      {origins === undefined ? null : origins.length === 0 ? (
        <p className="text-xs text-zinc-500">No ghostified items with images yet.</p>
      ) : (
        <>
          <p className="text-xs">
            Images come from <span className="font-mono">{origins.map(hostOf).join(', ')}</span>
            {counts && ` · ${counts.have} of ${counts.items} saved`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {granted ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void fill()}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageDown className="size-4" />
                )}
                Save missing thumbnails
              </button>
            ) : (
              <button type="button" className={btn} disabled={busy} onClick={() => void allow()}>
                <ImageDown className="size-4" /> Allow thumbnails from{' '}
                {origins.length === 1 ? hostOf(origins[0] as string) : `${origins.length} hosts`}
              </button>
            )}
            {note && <span className="text-xs text-zinc-500">{note}</span>}
          </div>
        </>
      )}
    </div>
  );
}
