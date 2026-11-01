import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sendMessage } from '../messaging';
import { type IndexStatus, indexProgress, indexStatus } from '../store/index-status';

/** "about 3 min left" from progress since `startedAt`; undefined until there's a rate. */
export function eta(
  s: IndexStatus,
  indexed: number,
  total: number,
  now: number,
): string | undefined {
  const done = indexed - (s.startIndexed ?? indexed);
  if (s.startedAt === undefined || done < 3) return undefined;
  const ms = ((now - s.startedAt) / done) * (total - indexed);
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'less than a minute left';
  return min < 90 ? `about ${min} min left` : `about ${Math.round(min / 60)} h left`;
}

function useIndexStatus(): IndexStatus {
  const [s, set] = useState<IndexStatus>({ running: false });
  useEffect(() => {
    void indexStatus.getValue().then(set);
    return indexStatus.watch((v) => set(v ?? { running: false }));
  }, []);
  return s;
}

/** Search-index card: live progress of the background embedding backfill. */
export function IndexProgress(props: { tag: string; className: string; button: string }) {
  const p = useLiveQuery(() => indexProgress(props.tag), [props.tag]);
  const s = useIndexStatus();
  if (!p) return null;
  const left = p.total - p.indexed;
  const pct = p.total ? Math.floor((p.indexed / p.total) * 100) : 100;
  const later = eta(s, p.indexed, p.total, Date.now());

  let line: React.ReactNode;
  if (!left) {
    line = (
      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4" /> All {p.total} items indexed
      </span>
    );
  } else if (s.running) {
    line = (
      <span className="flex items-center gap-1.5">
        <Loader2 className="size-4 animate-spin" />
        Indexing {p.indexed} of {p.total} ({pct}%){later && ` · ${later}`}
      </span>
    );
  } else if (s.error) {
    line = (
      <span className="flex items-center gap-1.5 text-amber-600">
        <CircleAlert className="size-4 shrink-0" />
        Paused at {p.indexed} of {p.total}: {s.error}. Retries every 5 minutes.
      </span>
    );
  } else {
    line = `${left} of ${p.total} items waiting; indexing starts when AI is idle.`;
  }

  return (
    <div className={props.className}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm">Search index</div>
          <div className="text-xs text-zinc-500">
            Ghosts are embedded in the background, one at a time, whenever no other AI work is
            waiting.
          </div>
        </div>
        {!!left && !s.running && (
          <button
            type="button"
            className={props.button}
            onClick={() => void sendMessage('reindex', undefined)}
          >
            {s.error ? 'Retry now' : 'Index now'}
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full bg-ghost-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-zinc-500">{line}</div>
    </div>
  );
}
