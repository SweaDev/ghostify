import { Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GhostItem } from '../store/db';
import { timeAgo } from './format';
import { GhostIcon } from './GhostIcon';

export interface ItemCardProps {
  item: GhostItem;
  compact?: boolean;
  /** Extra action buttons, rendered before "Unghost". */
  actions?: ReactNode;
  /** Extra line under the meta line (e.g. snooze time). */
  note?: ReactNode;
  onUnghost?(item: GhostItem): void;
  /** Opens the detail view when the thumbnail or excerpt is clicked. */
  onOpen?(item: GhostItem): void;
}

export function IconButton(props: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-ghost-50 hover:text-ghost-600 focus-visible:outline-2 focus-visible:outline-ghost-500 dark:text-zinc-400 dark:hover:bg-ghost-900/40 dark:hover:text-ghost-300"
    >
      {props.children}
    </button>
  );
}

export function ItemCard({ item, compact, actions, note, onUnghost, onOpen }: ItemCardProps) {
  const thumb = compact ? 'size-12' : 'h-16 w-24';
  return (
    <article className="group flex gap-3 rounded-xl p-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-900">
      <button
        type="button"
        aria-label="Show details"
        disabled={!onOpen}
        onClick={() => onOpen?.(item)}
        className={`${thumb} shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-ghost-100 to-ghost-200 enabled:cursor-zoom-in dark:from-ghost-900 dark:to-zinc-800`}
      >
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <GhostIcon className="size-full p-3 text-white/80 dark:text-ghost-700" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 font-medium text-sm leading-snug hover:text-ghost-600 dark:hover:text-ghost-300"
        >
          {item.title}
        </a>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[item.host, item.author, timeAgo(item.createdAt)].filter(Boolean).join(' · ')}
        </p>
        {note && <p className="mt-0.5 text-ghost-600 text-xs dark:text-ghost-300">{note}</p>}
        {!compact && item.excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
            {item.excerpt}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-70 transition group-hover:opacity-100">
        {actions}
        {onUnghost && (
          <IconButton label="Unghost (show on the site again)" onClick={() => onUnghost(item)}>
            <Eye className="size-4" />
          </IconButton>
        )}
      </div>
    </article>
  );
}
