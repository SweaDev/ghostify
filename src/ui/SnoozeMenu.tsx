import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from './ItemCard';
import { snoozePresets, toLocalInput } from './snooze';

const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function SnoozeMenu({ onSnooze }: { onSnooze(until: number): void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (until: number) => {
    setOpen(false);
    onSnooze(until);
  };
  const now = new Date();

  return (
    <div ref={ref} className="relative">
      <IconButton label="Snooze" onClick={() => setOpen((o) => !o)}>
        <Clock className="size-4" />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {snoozePresets(now).map((p) => (
            <button
              key={p.label}
              type="button"
              role="menuitem"
              onClick={() => pick(p.until.getTime())}
              className="flex w-full justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-ghost-50 dark:hover:bg-ghost-900/40"
            >
              <span>{p.label}</span>
              <span className="text-xs text-zinc-500">{fmt.format(p.until)}</span>
            </button>
          ))}
          <form
            className="mt-1 flex gap-1 border-zinc-100 border-t px-1 pt-2 dark:border-zinc-800"
            onSubmit={(e) => {
              e.preventDefault();
              const t = new Date(custom).getTime();
              if (t > Date.now()) pick(t);
            }}
          >
            <input
              type="datetime-local"
              aria-label="Snooze until"
              min={toLocalInput(now)}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700"
            />
            <button
              type="submit"
              className="rounded-md bg-ghost-500 px-2 text-white text-xs hover:bg-ghost-600"
            >
              Set
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
