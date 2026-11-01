export function Tags(props: { tags?: string[]; active?: string; onTag?(tag: string): void }) {
  if (!props.tags?.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {props.tags.map((t) => (
        <li key={t}>
          <button
            type="button"
            onClick={() => props.onTag?.(t)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition ${
              props.active === t
                ? 'bg-ghost-500 text-white'
                : 'bg-ghost-50 text-ghost-700 hover:bg-ghost-100 dark:bg-ghost-900/40 dark:text-ghost-200'
            }`}
          >
            #{t}
          </button>
        </li>
      ))}
    </ul>
  );
}
