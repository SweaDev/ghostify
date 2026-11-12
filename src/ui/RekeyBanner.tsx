import { useLiveQuery } from 'dexie-react-hooks';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Site } from '../sites/model';
import { getSites, sitesItem } from '../sites/registry';
import { createBackup } from '../store/backup';
import { applyRekey, pendingRekeys } from '../store/rekey';
import { downloadBackup } from './BackupSettings';
import { btn, btnPrimary, btnQuiet } from './kit';

function useSiteList(): Site[] | undefined {
  const [sites, setSites] = useState<Site[]>();
  useEffect(() => {
    void getSites().then(setSites);
    return sitesItem.watch((v) => setSites(v));
  }, []);
  return sites;
}

/**
 * Offers to move Ghostified items to the post links a site's current query-parameter rules give
 * them, so they stay hidden on the site. Never runs on its own.
 */
export function RekeyBanner({ onDone }: { onDone(message: string): void }) {
  const sites = useSiteList();
  const pending = useLiveQuery(() => (sites ? pendingRekeys(sites) : undefined), [sites]);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);
  const [error, setError] = useState<string>();
  if (!pending?.size || later) return null;
  const moves = [...pending.values()].flat();
  const n = moves.length;
  const hosts = [...pending.keys()].map((h) => h.replace(/^www\./, '')).join(', ');
  const update = async () => {
    setBusy(true);
    try {
      const moved = await applyRekey(moves);
      setError(undefined);
      onDone(
        `Updated ${moved} ${moved === 1 ? 'item' : 'items'}. A snapshot from before is in Settings → General.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Update item links"
      className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
    >
      <p className="text-amber-900 dark:text-amber-200">
        <strong>
          {n} Ghostified {n === 1 ? 'item' : 'items'} on {hosts}
        </strong>{' '}
        {n === 1 ? 'uses its' : 'use their'} old post {n === 1 ? 'link' : 'links'}, so{' '}
        {n === 1 ? 'it' : 'they'} may show again on the site. Updating moves{' '}
        {n === 1 ? 'it' : 'them'} to the site’s current query parameter choice; Ghostify takes a
        snapshot first.
      </p>
      {error && <p className="mt-2 text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => void createBackup('data').then(downloadBackup)}
        >
          <Download className="size-4" /> Download data backup
        </button>
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void update()}>
          <RefreshCw className="size-4" /> Update items
        </button>
        <button type="button" className={btnQuiet} onClick={() => setLater(true)}>
          Not now
        </button>
      </div>
    </section>
  );
}
