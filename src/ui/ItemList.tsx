import type { ReactNode } from 'react';
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
}) {
  if (!props.items) return null;
  if (!props.items.length)
    return <EmptyState title={props.empty.title}>{props.empty.hint}</EmptyState>;
  return (
    <ul className="flex flex-col gap-1">
      {props.items.map((item) => (
        <li key={item.key}>
          <ItemCard
            item={item}
            actions={props.actions?.(item)}
            note={props.note?.(item)}
            onUnghost={props.onUnghost}
            onOpen={props.onOpen}
          />
        </li>
      ))}
    </ul>
  );
}
