import { Bookmark, Ghost } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GhostItem, ItemState } from '../store/db';
import { expireSnoozes, setState, unghost, updateItem } from '../store/items';
import { timeAgo } from './format';
import { GhostIcon } from './GhostIcon';
import { IconButton } from './ItemCard';
import { ItemList } from './ItemList';
import { SnoozeMenu } from './SnoozeMenu';
import { Tabs } from './Tabs';
import { useCounts, useItems } from './useItems';

const RETURNED_WINDOW = 7 * 86_400_000;
const isReturned = (i: GhostItem, now: number) =>
  i.state === 'ghost' && !!i.returnedAt && now - i.returnedAt < RETURNED_WINDOW;

function Section(props: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider">
          {props.title}
        </h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

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

  // Snoozes also expire while this page is open (the background checks every few minutes).
  useEffect(() => {
    void expireSnoozes();
    const t = setInterval(() => void expireSnoozes(), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const returned = tab === 'ghost' ? items?.filter((i) => isReturned(i, now)) : [];
  const rest = items?.filter((i) => !returned?.includes(i));

  const move = (item: GhostItem, state: ItemState) => void setState(item.key, state);
  const actions = (item: GhostItem) => (
    <>
      {item.state !== 'later' && (
        <IconButton label="Read later" onClick={() => move(item, 'later')}>
          <Bookmark className="size-4" />
        </IconButton>
      )}
      <SnoozeMenu onSnooze={(until) => void setState(item.key, 'snoozed', until)} />
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
        {!!returned?.length && (
          <Section
            title="Back from snooze"
            action={
              <button
                type="button"
                className="text-ghost-600 text-xs hover:underline dark:text-ghost-300"
                onClick={() =>
                  returned.forEach((i) => void updateItem(i.key, { returnedAt: undefined }))
                }
              >
                Dismiss
              </button>
            }
          >
            <ItemList
              items={returned}
              empty={EMPTY.ghost}
              actions={actions}
              note={(i) => `Back ${timeAgo(i.returnedAt ?? now, now)}`}
              onUnghost={(i) => void unghost(i.key)}
            />
          </Section>
        )}
        <ItemList
          items={returned?.length && !rest?.length ? [] : rest}
          empty={returned?.length ? { title: 'That’s all', hint: '' } : EMPTY[tab]}
          actions={actions}
          note={(i) =>
            i.state === 'snoozed' && i.snoozeUntil ? `Back ${timeAgo(i.snoozeUntil, now)}` : null
          }
          onUnghost={(i) => void unghost(i.key)}
        />
      </main>
    </div>
  );
}
