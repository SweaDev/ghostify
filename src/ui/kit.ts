/** Shared class strings for Ghostify pages. */
export const card =
  'rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60';
export const field =
  'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-ghost-400 focus:ring-2 focus:ring-ghost-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-ghost-900';
const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-sm transition focus-visible:outline-2 focus-visible:outline-ghost-500 disabled:pointer-events-none disabled:opacity-50';
export const btn = `${base} border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;
export const btnPrimary = `${base} bg-ghost-500 text-white shadow-sm hover:bg-ghost-600`;
export const btnQuiet = `${base} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`;
export const btnDanger = `${base} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40`;
