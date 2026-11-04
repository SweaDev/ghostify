import { BookOpen, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { GhostItem } from '../store/db';
import { timeAgo } from './format';
import { btn, btnPrimary, btnQuiet } from './kit';
import type { Grab } from './useContent';

/** The item's full content, loaded into the viewer (reader view). */
export function ReaderView(props: { item: GhostItem; grab: Grab }) {
  const { item, grab } = props;
  const c = grab.content;
  if (!grab.grabbed || !c) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="rounded-2xl bg-ghost-50 p-4 text-ghost-500 dark:bg-ghost-900/40">
          <BookOpen className="size-8" />
        </div>
        <div className="font-medium">Read it here</div>
        <p className="max-w-sm text-sm text-zinc-500">
          Ghostify fetches the page and shows its main content, without the site's ads and chrome.
          You may be asked to allow access to {item.host} once.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={grab.busy || !item.url}
            onClick={() => void grab.grab()}
          >
            {grab.busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BookOpen className="size-4" />
            )}
            Load full content
          </button>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={btn}>
              Open original <ExternalLink className="size-4" />
            </a>
          )}
        </div>
        {grab.error && <p className="text-amber-600 text-sm">{grab.error}</p>}
      </div>
    );
  }
  return (
    <article className="px-5 py-5 sm:px-8">
      <header className="mb-6 border-zinc-100 border-b pb-4 dark:border-zinc-800">
        <h1 className="font-semibold text-2xl leading-tight tracking-tight">{c.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          {[c.byline, c.siteName ?? item.host, `loaded ${timeAgo(c.fetchedAt)}`]
            .filter(Boolean)
            .join(' · ')}
          <button
            type="button"
            className={`${btnQuiet} ml-auto px-2 py-0.5 text-xs`}
            disabled={grab.busy}
            onClick={() => void grab.grab()}
          >
            <RefreshCw className={`size-3 ${grab.busy ? 'animate-spin' : ''}`} /> Reload
          </button>
        </div>
        {grab.error && <p className="mt-2 text-amber-600 text-xs">{grab.error}</p>}
      </header>
      {/* Sanitized with DOMPurify when grabbed (src/feed/reader.ts). */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized article HTML */}
      <div className="reader" dangerouslySetInnerHTML={{ __html: c.html }} />
    </article>
  );
}
