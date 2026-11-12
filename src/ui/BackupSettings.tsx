import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Backup, createBackup, parseBackup } from '../store/backup';
import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  restoreBackup,
  type SnapshotMeta,
  takeSnapshot,
} from '../store/snapshots';
import { btn, btnDanger, btnQuiet, card } from './kit';

const REASONS: Record<SnapshotMeta['reason'], string> = {
  manual: 'Taken by you',
  'before-restore': 'Before a restore',
  'before-rekey': 'Before updating item links',
};

const stamp = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace(':', '');

export function downloadBackup(b: Backup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
  const name = b.kind === 'data' ? 'ghostify-data' : 'ghostify-snapshot';
  Object.assign(document.createElement('a'), {
    href: url,
    download: `${name}-${stamp(b.createdAt)}.json`,
  }).click();
  URL.revokeObjectURL(url);
}

const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

const confirmText = (b: Backup) =>
  b.kind === 'data'
    ? `Add the ${b.tables.items?.length ?? 0} Ghostified items in this backup? Items you have stay, unless the backup's copy is newer.`
    : `Restore the snapshot from ${new Date(b.createdAt).toLocaleString()}? Your Ghostified items, AI data, sites and settings are replaced by it. A snapshot of how things are now is taken first.`;

/** Settings → General → Backups: data backups, full snapshots and restores. */
export function BackupSettings() {
  const snapshots = useLiveQuery(listSnapshots, [], []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const file = useRef<HTMLInputElement>(null);

  const run = async (task: () => Promise<string | undefined>) => {
    setBusy(true);
    try {
      const text = await task();
      if (text) setNote({ ok: true, text });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const restore = (get: () => Promise<Backup>) =>
    run(async () => {
      const b = await get();
      if (!confirm(confirmText(b))) return;
      await restoreBackup(b);
      return b.kind === 'data' ? 'Backup added.' : 'Snapshot restored.';
    });

  return (
    <section className={`${card} flex flex-col gap-4`}>
      <div>
        <h3 className="font-semibold text-lg">Backups</h3>
        <p className="text-sm text-zinc-500">
          A data backup is a file with your Ghostified items. A snapshot keeps everything else too
          (AI summaries, read pages, sites and settings, but never API keys), so you can go back to
          it in one click. Ghostify takes one before every restore and before it updates item links.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => run(async () => void downloadBackup(await createBackup('data')))}
        >
          <Download className="size-4" /> Download data backup
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() =>
            run(async () => {
              await takeSnapshot('manual');
              return 'Snapshot taken.';
            })
          }
        >
          <Camera className="size-4" /> Take snapshot
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => file.current?.click()}>
          <Upload className="size-4" /> Restore from file
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          aria-label="Backup file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void restore(async () => parseBackup(await f.text()));
          }}
        />
      </div>
      {note && (
        <p
          role="status"
          className={`rounded-lg p-2 text-sm ${note.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}
        >
          {note.text}
        </p>
      )}
      {snapshots.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {snapshots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{new Date(s.createdAt).toLocaleString()}</p>
                <p className="text-xs text-zinc-500">
                  {REASONS[s.reason]} · v{s.app} · {s.counts.items ?? 0} items · {size(s.size)}
                </p>
              </div>
              <button
                type="button"
                className={btnQuiet}
                disabled={busy}
                aria-label="Restore snapshot"
                onClick={() => void restore(() => getSnapshot(s.id))}
              >
                <RotateCcw className="size-4" /> Restore
              </button>
              <button
                type="button"
                className={btnQuiet}
                disabled={busy}
                aria-label="Download snapshot"
                onClick={() => void run(async () => void downloadBackup(await getSnapshot(s.id)))}
              >
                <Download className="size-4" />
              </button>
              <button
                type="button"
                className={btnDanger}
                disabled={busy}
                aria-label="Delete snapshot"
                onClick={() => {
                  if (confirm('Delete this snapshot?'))
                    void run(async () => void (await deleteSnapshot(s.id)));
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
