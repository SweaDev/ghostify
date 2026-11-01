export interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export function Tabs<K extends string>(props: {
  tabs: Tab<K>[];
  active: K;
  onChange(key: K): void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
      {props.tabs.map((t) => {
        const on = t.key === props.active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => props.onChange(t.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-sm transition ${
              on
                ? 'bg-white text-ghost-700 shadow-sm dark:bg-zinc-800 dark:text-ghost-200'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  on ? 'bg-ghost-100 dark:bg-ghost-900' : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
