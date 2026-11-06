import {
  type FeedItem,
  type LlmBackend,
  openFeed,
  type RemovalHandle,
  removeItem,
  type SiteProfile,
} from 'feedgrab';
import { detectView, resolveProfile, type Site, type SiteRule, siteForUrl } from '../sites/model';
import type { ButtonPlacement } from '../store/settings';
import { isContextInvalidated, type RuntimeApi } from './api';
import { extractItem } from './extract';
import { mountGhostButton } from './ghost-button';
import { watchSamples } from './samples';

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
  /** LLM backend (proxy) for auto-ghostify rules; rules are skipped without one (AI off). */
  llm?: LlmBackend;
  /** False once the extension reloaded or updated under this page (orphaned content script). */
  alive?(): boolean;
  /** Where the ghost button sits on a hovered item. */
  placement?: ButtonPlacement;
}

/** Adds the site's enabled auto-ghostify rules to every feed as feedgrab `llm-text` exclusions. */
export function withRules(profile: SiteProfile, rules: SiteRule[]): SiteProfile {
  const extra = rules
    .filter((r) => r.enabled && r.criteria.trim())
    .map((r) => ({
      kind: 'llm-text' as const,
      criteria: r.criteria.trim(),
      id: r.id,
      origin: 'user' as const,
    }));
  if (!extra.length) return profile;
  return {
    ...profile,
    feeds: profile.feeds.map((f) => ({ ...f, exclude: [...f.exclude, ...extra] })),
  };
}

/** Watches the login indicator (debounced) and reports a view change once. */
function watchView(doc: Document, site: Site, onChange: () => void): () => void {
  const initial = detectView(site, doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Throttled, not debounced: on pages that mutate all the time a debounce would never fire.
  const mo = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
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

/**
 * Runs Ghostify on a page: opens the matching feedgrab feed, hides ghosted items (now and as
 * new ones load), lets the user ghostify items with the floating button and applies the site's
 * auto-ghostify rules when an LLM backend is given.
 */
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

function startFeed({ doc, url, sites, api, llm, alive, placement }: RuntimeOptions): FeedRuntime {
  const resolved = resolveProfile(sites, url, doc);
  if (!resolved) return { active: false, dispose() {} };

  const host = new URL(url).hostname;
  const ctx = { host, siteId: resolved.site.id, view: resolved.view, baseUrl: url };
  const profile = llm ? withRules(resolved.profile, resolved.site.rules) : resolved.profile;
  const feed = openFeed(doc, profile, { builtinExclusions: false, llm });
  const byElement = new WeakMap<Element, FeedItem>();
  const hidden = new Map<string, RemovalHandle>();
  let queue: FeedItem[] = [];
  let disposed = false;
  let orphaned = false;

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
    if (queue.push(item) === 1) queueMicrotask(() => void flush().catch(warn));
  };

  // An auto-ghostify rule matched (feedgrab marks the item excluded by an llm-text rule).
  const autoCheck = (item: FeedItem) => {
    const reason = item.reasons.find((r) => r.kind === 'llm-text');
    if (item.status !== 'excluded' || !reason || hidden.has(item.id)) return;
    hide(item);
    const auto = {
      ruleId: reason.ruleId,
      criteria: reason.criteria ?? '',
      confidence: reason.confidence ?? 1,
    };
    api
      .autoGhostify({ ...extractItem(item, ctx), auto })
      .then((saved) => saved || restore(item.id))
      .catch((e) => {
        restore(item.id);
        warn(e);
      });
  };

  const offAdded = feed.on('item:added', (item) => {
    track(item);
    autoCheck(item);
  });
  // A known item re-mounted as a new node (re-render, infinite scroll): hide or re-check it.
  const offUpdated = feed.on('item:updated', (item) => {
    autoCheck(item);
    if (byElement.get(item.element) === item) return;
    if (hidden.has(item.id)) {
      hidden.delete(item.id);
      byElement.set(item.element, item);
      hide(item);
    } else track(item);
  });

  const warn = (e: unknown) => {
    if (!isContextInvalidated(e)) console.warn('[ghostify]', e);
  };
  // The background is gone: stop offering the button and ask for a reload once.
  const orphan = () => {
    if (orphaned) return;
    orphaned = true;
    button.hide();
    button.toast(
      'Ghostify was updated. Reload this page to keep using it.',
      { label: 'Reload', run: () => doc.defaultView?.location.reload() },
      15000,
    );
  };

  const stopSamples = watchSamples({
    doc,
    url,
    siteId: resolved.site.id,
    profile: resolved.profile,
    feed,
    api,
    warn,
  });

  const button = mountGhostButton(doc, {
    placement,
    resolve(el) {
      if (orphaned) return undefined;
      if (alive?.() === false) {
        orphan();
        return undefined;
      }
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
            api.unghost(saved.key).catch(warn);
          },
        });
      } catch (e) {
        restore(item.id);
        if (isContextInvalidated(e) || alive?.() === false) return orphan();
        button.toast('Could not ghostify this item');
        console.warn('[ghostify]', e);
      }
    },
  });

  return {
    active: true,
    dispose() {
      disposed = true;
      stopSamples();
      offAdded();
      offUpdated();
      button.destroy();
      feed.dispose();
    },
  };
}
