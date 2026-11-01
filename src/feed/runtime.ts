import { type FeedItem, openFeed, type RemovalHandle, removeItem } from 'feedgrab';
import { detectView, resolveProfile, type Site, siteForUrl } from '../sites/model';
import type { RuntimeApi } from './api';
import { extractItem } from './extract';
import { mountGhostButton } from './ghost-button';

export interface FeedRuntime {
  /** False when no enabled site profile matches the page. */
  readonly active: boolean;
  dispose(): void;
}

export interface RuntimeOptions {
  doc: Document;
  url: string;
  sites: Site[];
  api: RuntimeApi;
  /** Called once when the site's login view changes, so the caller can restart the runtime. */
  onViewChange?(): void;
}

/**
 * Runs Ghostify on a page: opens the matching feedgrab feed, hides ghosted items (now and as
 * new ones load) and lets the user ghostify items with the floating button.
 */
/** Watches the login indicator (debounced) and reports a view change once. */
function watchView(doc: Document, site: Site, onChange: () => void): () => void {
  const initial = detectView(site, doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const mo = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (detectView(site, doc) === initial) return;
      mo.disconnect();
      onChange();
    }, 300);
  });
  mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
  return () => {
    clearTimeout(timer);
    mo.disconnect();
  };
}

export function startFeedRuntime(opts: RuntimeOptions): FeedRuntime {
  const { doc, url, sites, onViewChange } = opts;
  const site = siteForUrl(sites, url);
  const stopWatch =
    site?.loginIndicator && onViewChange ? watchView(doc, site, onViewChange) : () => {};
  const runtime = startFeed(opts);
  return {
    active: runtime.active,
    dispose() {
      stopWatch();
      runtime.dispose();
    },
  };
}

function startFeed({ doc, url, sites, api }: RuntimeOptions): FeedRuntime {
  const resolved = resolveProfile(sites, url, doc);
  if (!resolved) return { active: false, dispose() {} };

  const host = new URL(url).hostname;
  const ctx = { host, siteId: resolved.site.id, view: resolved.view, baseUrl: url };
  const feed = openFeed(doc, resolved.profile, { builtinExclusions: false });
  const byElement = new WeakMap<Element, FeedItem>();
  const hidden = new Map<string, RemovalHandle>();
  let queue: FeedItem[] = [];
  let disposed = false;

  const hide = (item: FeedItem) => {
    if (!hidden.has(item.id)) hidden.set(item.id, removeItem(item));
  };
  const restore = (id: string) => {
    hidden.get(id)?.restore();
    hidden.delete(id);
  };

  const flush = async () => {
    const batch = queue;
    queue = [];
    const ids = await api.isGhosted(
      host,
      batch.map((i) => i.id),
    );
    if (disposed) return;
    const ghosted = new Set(ids);
    for (const item of batch) if (ghosted.has(item.id)) hide(item);
  };

  const track = (item: FeedItem) => {
    byElement.set(item.element, item);
    if (queue.push(item) === 1) queueMicrotask(() => void flush().catch(console.warn));
  };

  const offAdded = feed.on('item:added', track);
  // A known item re-mounted as a new node (re-render, infinite scroll): hide or re-check it.
  const offUpdated = feed.on('item:updated', (item) => {
    if (byElement.get(item.element) === item) return;
    if (hidden.has(item.id)) {
      hidden.delete(item.id);
      byElement.set(item.element, item);
      hide(item);
    } else track(item);
  });

  const button = mountGhostButton(doc, {
    resolve(el) {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const item = byElement.get(n);
        if (item && item.element === n && !hidden.has(item.id)) return n;
      }
      return undefined;
    },
    async onGhost(el) {
      const item = byElement.get(el);
      if (!item) return;
      const draft = extractItem(item, ctx);
      hide(item);
      try {
        const saved = await api.ghostify(draft);
        button.toast('Ghostified', {
          label: 'Undo',
          run: () => {
            restore(item.id);
            void api.unghost(saved.key);
          },
        });
      } catch (e) {
        restore(item.id);
        button.toast('Could not ghostify this item');
        console.warn('[ghostify]', e);
      }
    },
  });

  return {
    active: true,
    dispose() {
      disposed = true;
      offAdded();
      offUpdated();
      button.destroy();
      feed.dispose();
    },
  };
}
