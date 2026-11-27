import type { FeedContentType, Selector } from 'feedgrab';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { KIND_INFO } from '../kinds';
import { field } from '../kit';

/** Short name of a feed content type ("Videos", "Mixed"). */
export const typeLabel = (t: FeedContentType) => (t === 'mixed' ? 'Mixed' : KIND_INFO[t].plural);

export function TypeBadge({ type }: { type: FeedContentType }) {
  const Icon = type === 'mixed' ? null : KIND_INFO[type].Icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ghost-50 px-2 py-0.5 font-medium text-[11px] text-ghost-700 dark:bg-ghost-900/50 dark:text-ghost-200">
      {Icon && <Icon className="size-3" />}
      {typeLabel(type)}
    </span>
  );
}

const ADVANCED_KEY = 'ghostify:grab:advanced';

function remembered(id: string): boolean {
  try {
    return localStorage.getItem(`${ADVANCED_KEY}:${id}`) === '1';
  } catch {
    return false;
  }
}

/** "Advanced options", folded unless the user opened it before (remembered per section). */
export function Advanced(props: { id: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(() => remembered(props.id));
  useEffect(() => {
    try {
      localStorage.setItem(`${ADVANCED_KEY}:${props.id}`, open ? '1' : '0');
    } catch {}
  }, [open, props.id]);
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-xs text-zinc-600 dark:text-zinc-300"
      >
        <ChevronDown className={`size-4 transition ${open ? '' : '-rotate-90'}`} />
        {props.label ?? 'Advanced options'}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-zinc-200 border-t p-3 dark:border-zinc-800">
          {props.children}
        </div>
      )}
    </div>
  );
}

/** A CSS/XPath selector editor that applies on Enter or blur. */
export function SelectorInput(props: {
  label: string;
  value: Selector;
  placeholder?: string;
  onApply(sel: Selector): void;
}) {
  const [type, setType] = useState(props.value.type);
  const [value, setValue] = useState(props.value.value);
  useEffect(() => {
    setType(props.value.type);
    setValue(props.value.value);
  }, [props.value.type, props.value.value]);
  const apply = () => {
    if (value !== props.value.value || type !== props.value.type) props.onApply({ type, value });
  };
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{props.label}</span>
      <span className="flex gap-1">
        <select
          aria-label={`${props.label} type`}
          value={type}
          onChange={(e) => setType(e.target.value as Selector['type'])}
          className={`${field} w-20 text-xs`}
        >
          <option value="css">CSS</option>
          <option value="xpath">XPath</option>
        </select>
        <input
          value={value}
          placeholder={props.placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className={`${field} min-w-0 flex-1 font-mono text-xs`}
        />
      </span>
    </label>
  );
}

/** "8 of 8" with a muted look when not all items have it. */
export function Coverage({ share, total }: { share: number; total: number }) {
  const n = Math.round(share * total);
  const full = n === total && total > 0;
  return (
    <span
      title={`Found in ${n} of ${total} items`}
      className={`shrink-0 rounded-md px-1.5 py-0.5 font-medium text-[10px] tabular-nums ${
        full
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : n
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
      }`}
    >
      {n}/{total}
    </span>
  );
}
