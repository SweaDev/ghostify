import { ExternalLink, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import type { GhostItem } from '../store/db';
import { timeAgo } from './format';

export function ItemDetail(props: { item: GhostItem; actions?: ReactNode; onClose(): void }) {
  const { item, onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-zinc-100 border-b px-4 py-2 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">{item.host}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X className="size-4" />
          </button>
        </div>
        {item.image && <img src={item.image} alt="" className="aspect-[2/1] w-full object-cover" />}
        <div className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold text-xl leading-snug">{item.title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {[item.author, `ghosted ${timeAgo(item.createdAt)}`].filter(Boolean).join(' · ')}
          </p>
          {item.excerpt && (
            <p className="whitespace-pre-line text-sm text-zinc-700 leading-relaxed dark:text-zinc-300">
              {item.excerpt}
            </p>
          )}
          <div className="flex items-center gap-2 pt-2">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ghost-500 px-3 py-2 font-medium text-sm text-white hover:bg-ghost-600"
              >
                Open original <ExternalLink className="size-4" />
              </a>
            )}
            <div className="ml-auto flex">{props.actions}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
