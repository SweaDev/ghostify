import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface Filters {
  text: string;
  host: string;
  tag?: string;
}

export function FilterBar(props: { hosts: string[]; value: Filters; onChange(f: Filters): void }) {
  const [text, setText] = useState(props.value.text);
  const { value, onChange } = props;

  useEffect(() => {
    const t = setTimeout(() => text !== value.text && onChange({ ...value, text }), 200);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          placeholder="Search ghosts…"
          aria-label="Search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2 pr-8 pl-9 text-sm outline-none transition focus:border-ghost-400 focus:ring-2 focus:ring-ghost-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-ghost-900"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setText('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700"
          >
            <X className="size-4" />
          </button>
        )}
      </label>
      {value.tag && (
        <button
          type="button"
          aria-label={`Remove tag filter ${value.tag}`}
          onClick={() => onChange({ ...value, tag: undefined })}
          className="inline-flex items-center gap-1 rounded-full bg-ghost-500 px-3 py-1.5 text-sm text-white"
        >
          #{value.tag} <X className="size-3.5" />
        </button>
      )}
      {props.hosts.length > 1 && (
        <select
          aria-label="Site"
          value={value.host}
          onChange={(e) => onChange({ ...value, host: e.target.value })}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <option value="">All sites</option>
          {props.hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
