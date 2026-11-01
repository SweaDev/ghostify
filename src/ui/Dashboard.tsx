import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, Bookmark, ExternalLink, Ghost, Pause, Settings, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '../messaging';
import type { GhostItem, ItemState } from '../store/db';
import { db } from '../store/db';
import {
  expireSnoozes,
  rescue,
  restore,
  setState,
  snapshot,
  unghost,
  updateItem,
} from '../store/items';
import { AiActivity } from './AiActivity';
import { FilterBar, type Filters } from './FilterBar';
import { timeAgo } from './format';
import { useSettings } from './GeneralSettings';
import { GhostIcon } from './GhostIcon';
import { IconButton } from './ItemCard';
import { ItemDetail, type ViewerTab } from './ItemDetail';
import { ItemList } from './ItemList';
import { openUrl, viewerHash } from './open';
import { SnoozeMenu } from './SnoozeMenu';
import { Tabs } from './Tabs';
import { useToast } from './Toast';
import { useActiveCount, useAiPaused } from './useAi';
import { useDialogFocus } from './useDialogFocus';
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

function HeaderButton(props: {
  label: string;
  onClick(): void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className="relative inline-flex items-center gap-1.5 rounded-xl p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 aria-pressed:bg-ghost-50 aria-pressed:text-ghost-700 dark:text-zinc-300 dark:aria-pressed:bg-ghost-900/40 dark:aria-pressed:text-ghost-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {props.children}
    </button>
  );
}

/** Header button for the AI activity drawer: shows how many jobs are active, or that AI is paused. */
function AiButton(props: { open: boolean; onClick(): void }) {
  const n = useActiveCount() ?? 0;
  const paused = useAiPaused();
  return (
    <HeaderButton label="AI activity" pressed={props.open} onClick={props.onClick}>
      {paused ? <Pause className="size-5 text-amber-500" /> : <Activity className="size-5" />}
      {n > 0 && (
        <span
          className={`absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center font-semibold text-[10px] text-white leading-4 ${
            paused ? 'bg-amber-500' : 'animate-pulse bg-ghost-500'
          }`}
        >
          {n}
        </span>
      )}
    </HeaderButton>
  );
}

function ActivityDrawer(props: { onClose(): void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close AI activity"
        className="absolute inset-0 cursor-default bg-zinc-950/20"
        onClick={props.onClose}
      />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="AI activity"
        className="relative flex outline-none h-full w-full max-w-lg flex-col gap-3 bg-white p-4 shadow-2xl dark:bg-zinc-950"
      >
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-ghost-500" />
          <h2 className="font-semibold">AI activity</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={props.onClose}
            className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X className="size-4" />
          </button>
        </div>
        <AiActivity compact />
      </aside>
    </div>
  );
}

/** One item's viewer as a whole page (`dashboard.html#item=<key>`). */
function ViewerPage(props: { itemKey: string; tab?: ViewerTab; onBack(): void }) {
  const item = useLiveQuery(() => db.items.get(props.itemKey), [props.itemKey], null);
  const [settings] = useSettings();
  useEffect(() => {
    if (item) document.title = `${item.title} · Ghostify`;
  }, [item]);
  if (item === null) return null;
  if (!item)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-zinc-500">
        <GhostIcon className="size-12 text-ghost-300" />
        This ghost is gone (it was unghosted).
        <button type="button" className="text-ghost-600 hover:underline" onClick={props.onBack}>
          Back to Ghostify
        </button>
      </div>
    );
  return (
    <ItemDetail
      page
      item={item}
      initialTab={props.tab}
      aiEnabled={settings?.ai.enabled}
      onClose={props.onBack}
      onRegenerate={
        settings?.ai.enabled ? () => void sendMessage('enrich', { key: item.key }) : undefined
      }
    />
  );
}

export function Dashboard() {
  const [hash, setHash] = useState(() => viewerHash());
  useEffect(() => {
    const on = () => setHash(viewerHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (hash.key)
    return (
      <ViewerPage
        itemKey={hash.key}
        tab={hash.tab as ViewerTab | undefined}
        onBack={() => {
          history.replaceState(null, '', location.pathname);
          document.title = 'Ghostify';
          setHash({});
        }}
      />
    );
  return <Feed />;
}

function Feed() {
  const [activity, setActivity] = useState(false);
  const closeActivity = useCallback(() => setActivity(false), []);
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
  // Read by key, so the viewer stays open when its item leaves the filtered list (e.g. moved to Later).
  const listed = items?.find((i) => i.key === openKey);
  const live = useLiveQuery(() => (openKey ? db.items.get(openKey) : undefined), [openKey]);
  const opened = openKey && live?.key === openKey ? live : listed;
  const closeDetail = useCallback(() => setOpenKey(undefined), []);
  const toast = useToast();
  const remove = async (item: GhostItem) => {
    const snap = await snapshot(item.key);
    await unghost(item.key);
    if (snap)
      toast.show('Unghosted. It shows on the site again.', {
        label: 'Undo',
        run: () => void restore(snap),
      });
  };

  // Snoozes also expire while this page is open (the background checks every few minutes).
  useEffect(() => {
    void expireSnoozes();
    const t = setInterval(() => void expireSnoozes(), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const returned = tab === 'ghost' && !filtering ? items?.filter((i) => isReturned(i, now)) : [];
  const back = new Set(returned?.map((i) => i.key));
  const rest = items?.filter((i) => !back.has(i.key));

  const move = (item: GhostItem, state: ItemState) => void setState(item.key, state);
  const actions = (item: GhostItem) => (
    <>
      {item.auto && (
        <IconButton label="Not this (keep it on the site)" onClick={() => void rescue(item.key)}>
          <Undo2 className="size-4" />
        </IconButton>
      )}
      {item.state !== 'later' && (
        <IconButton label="Read later" onClick={() => move(item, 'later')}>
          <Bookmark className="size-4" />
        </IconButton>
      )}
      <SnoozeMenu onSnooze={(until) => void setState(item.key, 'snoozed', until)} />
      {item.url && (
        <IconButton label="Open original" onClick={() => openUrl(item.url as string, 'tab')}>
          <ExternalLink className="size-4" />
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
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <GhostIcon className="size-8 text-ghost-500" />
            <h1 className="font-semibold text-xl tracking-tight">Ghostify</h1>
          </div>
          <nav className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">
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
          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            {settings?.ai.enabled && (
              <AiButton open={activity} onClick={() => setActivity(!activity)} />
            )}
            <HeaderButton label="Settings" onClick={() => void browser.runtime.openOptionsPage()}>
              <Settings className="size-5" />
            </HeaderButton>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
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
              onUnghost={(i) => void remove(i)}
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
            i.state === 'snoozed' && i.snoozeUntil
              ? `Back ${timeAgo(i.snoozeUntil, now)}`
              : i.auto
                ? `Auto-ghosted: ${i.auto.criteria}`
                : null
          }
          onUnghost={(i) => void remove(i)}
          onOpen={(i) => setOpenKey(i.key)}
          onTag={onTag}
          activeTag={filters.tag}
        />
      </main>
      {opened && (
        <ItemDetail
          key={opened.key}
          item={opened}
          actions={actions(opened)}
          onClose={closeDetail}
          onTag={(t) => {
            onTag(t);
            closeDetail();
          }}
          aiEnabled={settings?.ai.enabled}
          onRegenerate={
            settings?.ai.enabled ? () => void sendMessage('enrich', { key: opened.key }) : undefined
          }
        />
      )}
      {activity && <ActivityDrawer onClose={closeActivity} />}
      {toast.view}
    </div>
  );
}
