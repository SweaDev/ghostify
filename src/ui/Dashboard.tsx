import { Bookmark, Ghost } from 'lucide-react';
import { useState } from 'react';
import type { GhostItem, ItemState } from '../store/db';
import { setState, unghost } from '../store/items';
import { GhostIcon } from './GhostIcon';
import { IconButton } from './ItemCard';
import { ItemList } from './ItemList';
import { Tabs } from './Tabs';
import { useCounts, useItems } from './useItems';

const EMPTY: Record<ItemState, { title: string; hint: string }> = {
  ghost: {
    title: 'No ghosts here',
    hint: 'Hover a post on a supported site and click the ghost to hide it.',
  },
  later: { title: 'Nothing saved for later', hint: 'Move ghosted posts here to read them later.' },
  snoozed: {
    title: 'Nothing snoozed',
    hint: 'Snoozed posts come back to Ghosted when time is up.',
  },
};

export function Dashboard() {
  const [tab, setTab] = useState<ItemState>('ghost');
  const counts = useCounts();
  const items = useItems({ state: tab });

  const move = (item: GhostItem, state: ItemState) => void setState(item.key, state);
  const actions = (item: GhostItem) => (
    <>
      {item.state !== 'later' && (
        <IconButton label="Read later" onClick={() => move(item, 'later')}>
          <Bookmark className="size-4" />
        </IconButton>
      )}
      {item.state !== 'ghost' && (
        <IconButton label="Back to Ghosted" onClick={() => move(item, 'ghost')}>
          <Ghost className="size-4" />
        </IconButton>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-ghost-50/60 to-transparent dark:from-ghost-900/20">
      <header className="sticky top-0 z-10 border-zinc-200/70 border-b bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <GhostIcon className="size-8 text-ghost-500" />
            <h1 className="font-semibold text-xl tracking-tight">Ghostify</h1>
          </div>
          <nav className="ml-auto">
            <Tabs<ItemState>
              active={tab}
              onChange={setTab}
              tabs={[
                { key: 'ghost', label: 'Ghosted', count: counts?.ghost },
                { key: 'later', label: 'Later', count: counts?.later },
                { key: 'snoozed', label: 'Snoozed', count: counts?.snoozed },
              ]}
            />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ItemList
          items={items}
          empty={EMPTY[tab]}
          actions={actions}
          onUnghost={(i) => void unghost(i.key)}
        />
      </main>
    </div>
  );
}
