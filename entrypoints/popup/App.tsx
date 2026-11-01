import { unghost } from '@/src/store/items';
import { EmptyState } from '@/src/ui/EmptyState';
import { GhostIcon } from '@/src/ui/GhostIcon';
import { ItemCard } from '@/src/ui/ItemCard';
import { useCounts, useItems } from '@/src/ui/useItems';

export function App() {
  const items = useItems({ state: 'ghost', limit: 30 });
  const counts = useCounts();
  return (
    <main className="flex max-h-[560px] w-[360px] flex-col">
      <header className="flex items-center gap-2 border-zinc-100 border-b px-4 py-3 dark:border-zinc-800">
        <GhostIcon className="size-7 text-ghost-500" />
        <h1 className="font-semibold text-base">Ghostify</h1>
        {counts && (
          <span className="ml-auto rounded-full bg-ghost-50 px-2 py-0.5 font-medium text-ghost-700 text-xs dark:bg-ghost-900/50 dark:text-ghost-200">
            {counts.ghost} ghosted
          </span>
        )}
      </header>
      <section className="flex-1 overflow-y-auto p-2">
        {items?.length === 0 && (
          <EmptyState title="Nothing ghosted yet">
            Hover a post on dev.to and click the ghost to hide it here.
          </EmptyState>
        )}
        {items?.map((item) => (
          <ItemCard key={item.key} item={item} compact onUnghost={(i) => void unghost(i.key)} />
        ))}
      </section>
    </main>
  );
}
