import { Bookmark, Ghost } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../messaging';
import type { GhostItem, ItemState } from '../store/db';
import { expireSnoozes, setState, unghost, updateItem } from '../store/items';
import { FilterBar, type Filters } from './FilterBar';
import { timeAgo } from './format';
import { useSettings } from './GeneralSettings';
import { GhostIcon } from './GhostIcon';
import { IconButton } from './ItemCard';
import { ItemDetail } from './ItemDetail';
import { ItemList } from './ItemList';
import { SnoozeMenu } from './SnoozeMenu';
import { Tabs } from './Tabs';
import { useCounts, useHosts, useItems } from './useItems';

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
  const [filters, setFilters] = useState<Filters>({ text: '', host: '' });
  const [openKey, setOpenKey] = useState<string>();
  const keywordItems = useItems({
    state: tab,
    text: filters.semantic ? undefined : filters.text,
    host: filters.host || undefined,
    tag: filters.tag,
  });
  const [settings] = useSettings();
  const semanticOn = !!(settings?.ai.enabled && filters.semantic && filters.text.trim());
  const [semantic, setSemantic] = useState<{ items: GhostItem[]; fallback: boolean }>();
  useEffect(() => {
    if (!semanticOn) return setSemantic(undefined);
    let live = true;
    const q = { state: tab, host: filters.host || undefined, tag: filters.tag };
    void sendMessage('searchSemantic', { query: filters.text, filters: q }).then((r) => {
      if (live) setSemantic(r);
    });
    return () => {
      live = false;
    };
  }, [semanticOn, filters.text, filters.host, filters.tag, tab]);
  const onTag = (tag: string) =>
    setFilters((f) => ({ ...f, tag: f.tag === tag ? undefined : tag }));
  const hosts = useHosts();
  const items = semanticOn ? semantic?.items : keywordItems;
  const filtering = !!(filters.text || filters.host || filters.tag);
  const opened = items?.find((i) => i.key === openKey);
  const closeDetail = useCallback(() => setOpenKey(undefined), []);

  // Snoozes also expire while this page is open (the background checks every few minutes).
  useEffect(() => {
    void expireSnoozes();
    const t = setInterval(() => void expireSnoozes(), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const returned = tab === 'ghost' && !filtering ? items?.filter((i) => isReturned(i, now)) : [];
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
        <div className="mb-6">
          <FilterBar
            hosts={hosts ?? []}
            semanticAvailable={settings?.ai.enabled}
            value={filters}
            onChange={setFilters}
          />
          {semantic?.fallback && (
            <p className="mt-2 text-amber-600 text-xs">
              Semantic search is unavailable (check Settings → AI); showing keyword matches.
            </p>
          )}
        </div>
        {semanticOn && !semantic && (
          <p className="px-2 py-6 text-center text-sm text-zinc-500">Searching…</p>
        )}
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
              onOpen={(i) => setOpenKey(i.key)}
              onTag={onTag}
              activeTag={filters.tag}
            />
          </Section>
        )}
        <ItemList
          items={returned?.length && !rest?.length ? [] : rest}
          empty={
            filtering
              ? { title: 'No matches', hint: 'Try other words or another site.' }
              : returned?.length
                ? { title: 'That’s all', hint: '' }
                : EMPTY[tab]
          }
          actions={actions}
          note={(i) =>
            i.state === 'snoozed' && i.snoozeUntil ? `Back ${timeAgo(i.snoozeUntil, now)}` : null
          }
          onUnghost={(i) => void unghost(i.key)}
          onOpen={(i) => setOpenKey(i.key)}
          onTag={onTag}
          activeTag={filters.tag}
        />
      </main>
      {opened && (
        <ItemDetail
          item={opened}
          actions={actions(opened)}
          onClose={closeDetail}
          onTag={(t) => {
            onTag(t);
            closeDetail();
          }}
          onRegenerate={
            settings?.ai.enabled ? () => void sendMessage('enrich', { key: opened.key }) : undefined
          }
        />
      )}
    </div>
  );
}
