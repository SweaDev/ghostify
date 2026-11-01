import type { ReactNode } from 'react';
import { GhostIcon } from './GhostIcon';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <GhostIcon className="size-12 animate-bounce text-ghost-200 [animation-duration:2.4s] dark:text-ghost-800" />
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{title}</p>
      {children && <div className="text-sm text-zinc-500 dark:text-zinc-400">{children}</div>}
    </div>
  );
}
