import { Search, Shuffle, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Sort, SortBy, SortOrder } from './sort';

const SELECT =
  'rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900';
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function SortControls({ value, onChange }: { value: Sort; onChange(s: Sort): void }) {
  const random = value.order === 'random';
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Sort by"
        value={value.by}
        disabled={random}
        title={random ? 'Random order ignores this' : 'Relevance needs a search; otherwise by date'}
        onChange={(e) => onChange({ ...value, by: e.target.value as SortBy })}
        className={SELECT}
      >
        <option value="date">Date ghostified</option>
        <option value="relevance">Relevance</option>
      </select>
      <select
        aria-label="Sort order"
        value={value.order}
        onChange={(e) => {
          const order = e.target.value as SortOrder;
          onChange({ ...value, order, seed: order === 'random' ? newSeed() : value.seed });
        }}
        className={SELECT}
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
        <option value="random">Random</option>
      </select>
      {random && (
        <button
          type="button"
          aria-label="Shuffle again"
          title="Shuffle again"
          onClick={() => onChange({ ...value, seed: newSeed() })}
          className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <Shuffle className="size-4" />
        </button>
      )}
    </div>
  );
}

export interface Filters {
  text: string;
  host: string;
  tag?: string;
  /** Rank by meaning (embeddings) instead of matching keywords. */
  semantic?: boolean;
}

export function FilterBar(props: {
  hosts: string[];
  /** Show the semantic toggle (AI on). */
  semanticAvailable?: boolean;
  value: Filters;
  onChange(f: Filters): void;
  sort: Sort;
  onSort(s: Sort): void;
}) {
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
          placeholder={value.semantic ? 'Describe what you are looking for…' : 'Search ghosts…'}
          aria-label="Search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2 pr-8 pl-9 text-sm outline-none transition focus:border-ghost-400 focus:ring-2 focus:ring-ghost-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-ghost-900 [&::-webkit-search-cancel-button]:appearance-none"
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
      {props.semanticAvailable && (
        <button
          type="button"
          aria-pressed={!!value.semantic}
          title="Search by meaning"
          onClick={() => onChange({ ...value, semantic: !value.semantic })}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
            value.semantic
              ? 'border-ghost-500 bg-ghost-500 text-white'
              : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          <Sparkles className="size-4" /> Semantic
        </button>
      )}
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
      <SortControls value={props.sort} onChange={props.onSort} />
      {props.hosts.length > 1 && (
        <select
          aria-label="Site"
          value={value.host}
          onChange={(e) => onChange({ ...value, host: e.target.value })}
          className={SELECT}
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
