import { AppWindow, ArrowUpRight, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import { unghost } from '@/src/store/items';
import { CurrentSite } from '@/src/ui/CurrentSite';
import { EmptyState } from '@/src/ui/EmptyState';
import { GhostIcon } from '@/src/ui/GhostIcon';
import { IconButton, ItemCard } from '@/src/ui/ItemCard';
import { openUrl } from '@/src/ui/open';
import { useCounts, useItems } from '@/src/ui/useItems';

export function App() {
  const items = useItems({ state: 'ghost', limit: 30 });
  const counts = useCounts();
  return (
    <main className="flex max-h-[560px] w-[360px] flex-col">
      <header className="flex items-center gap-2 border-zinc-100 border-b px-4 py-3 dark:border-zinc-800">
        <GhostIcon className="size-7 drop-shadow-sm" />
        <h1 className="font-semibold text-base">Ghostify</h1>
        {counts && (
          <span className="ml-auto rounded-full bg-ghost-50 px-2 py-0.5 font-medium text-ghost-700 text-xs dark:bg-ghost-900/50 dark:text-ghost-200">
            {counts.ghost} ghostified
          </span>
        )}
        <IconButton label="Settings" onClick={() => void browser.runtime.openOptionsPage()}>
          <Settings className="size-4" />
        </IconButton>
      </header>
      <CurrentSite />
      <section className="flex-1 overflow-y-auto p-2">
        {items?.length === 0 && (
          <EmptyState title="Nothing ghostified yet">
            Hover a post on dev.to and click the ghost to hide it here.
          </EmptyState>
        )}
        {items?.map((item) => (
          <ItemCard key={item.key} item={item} compact onUnghost={(i) => void unghost(i.key)} />
        ))}
      </section>
      <footer className="flex gap-1.5 border-zinc-100 border-t p-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            openUrl(browser.runtime.getURL('/dashboard.html'), 'tab');
            window.close();
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ghost-500 px-3 py-2 font-medium text-sm text-white transition hover:bg-ghost-600"
        >
          Open Ghostify <ArrowUpRight className="size-4" />
        </button>
        <button
          type="button"
          title="Open Ghostify in a new window"
          aria-label="Open Ghostify in a new window"
          onClick={() => {
            openUrl(browser.runtime.getURL('/dashboard.html'), 'window');
            window.close();
          }}
          className="rounded-lg border border-zinc-200 px-2.5 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <AppWindow className="size-4" />
        </button>
      </footer>
    </main>
  );
}
