import { type ReactNode, useState } from 'react';
import type { GhostItem } from '../store/db';
import { EmptyState } from './EmptyState';
import { ItemCard, type ItemCardProps } from './ItemCard';

export function ItemList(props: {
  items: GhostItem[] | undefined;
  empty: { title: string; hint?: ReactNode };
  actions?(item: GhostItem): ReactNode;
  note?(item: GhostItem): ReactNode;
  onUnghost?: ItemCardProps['onUnghost'];
  onOpen?: ItemCardProps['onOpen'];
  onTag?: ItemCardProps['onTag'];
  activeTag?: string;
  /** Cards rendered at first and per "Show more". */
  page?: number;
}) {
  const page = props.page ?? 50;
  const [limit, setLimit] = useState(page);
  if (!props.items) return null;
  if (!props.items.length)
    return <EmptyState title={props.empty.title}>{props.empty.hint}</EmptyState>;
  const left = props.items.length - limit;
  return (
    <ul className="flex flex-col gap-1">
      {props.items.slice(0, limit).map((item) => (
        <li key={item.key}>
          <ItemCard
            item={item}
            actions={props.actions?.(item)}
            note={props.note?.(item)}
            onUnghost={props.onUnghost}
            onOpen={props.onOpen}
            onTag={props.onTag}
            activeTag={props.activeTag}
          />
        </li>
      ))}
      {left > 0 && (
        <li className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setLimit((l) => l + page)}
            className="rounded-lg px-3 py-1.5 font-medium text-ghost-600 text-sm hover:bg-ghost-50 dark:text-ghost-300 dark:hover:bg-ghost-900/40"
          >
            Show more ({left} left)
          </button>
        </li>
      )}
    </ul>
  );
}
