import { GhostIcon } from '@/src/ui/GhostIcon';

export function App() {
  return (
    <main className="w-80 p-4">
      <header className="flex items-center gap-2">
        <GhostIcon className="size-6 text-ghost-500" />
        <h1 className="font-semibold text-lg">Ghostify</h1>
      </header>
    </main>
  );
}
