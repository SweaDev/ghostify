import {
  AppWindow,
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelTop,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';
import type { GhostItem } from '../store/db';
import { AskPanel } from './AskPanel';
import { timeAgo } from './format';
import { GhostIcon } from './GhostIcon';
import { btnPrimary } from './kit';
import { openUrl, type Target, viewerUrl } from './open';
import { ReaderView } from './ReaderView';
import { Tags } from './Tags';
import { useContent } from './useContent';
import { useDialogFocus } from './useDialogFocus';

export type ViewerTab = 'overview' | 'reader' | 'ask';
const TABS: { key: ViewerTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'overview', label: 'Overview', icon: GhostIcon },
  { key: 'reader', label: 'Reader', icon: BookOpen },
  { key: 'ask', label: 'Ask AI', icon: Sparkles },
];

function ToolButton(props: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {props.children}
    </button>
  );
}

function Overview(props: {
  item: GhostItem;
  actions?: ReactNode;
  onTag?(tag: string): void;
  onRegenerate?(): void;
}) {
  const { item } = props;
  return (
    <>
      {item.image && <img src={item.image} alt="" className="aspect-[2/1] w-full object-cover" />}
      <div className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold text-xl leading-snug">{item.title}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {[item.author, item.host, `ghosted ${timeAgo(item.createdAt)}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {(item.summary || props.onRegenerate) && (
          <div className="rounded-xl bg-ghost-50 p-3 dark:bg-ghost-900/30">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ghost-700 text-xs dark:text-ghost-200">
              <Sparkles className="size-3.5" /> Summary
              {props.onRegenerate && (
                <button
                  type="button"
                  onClick={props.onRegenerate}
                  className="ml-auto inline-flex items-center gap-1 font-normal hover:underline"
                >
                  <RefreshCw className="size-3" /> {item.summary ? 'Regenerate' : 'Generate'}
                </button>
              )}
            </div>
            <p className="text-sm">{item.summary ?? 'No summary yet.'}</p>
            <Tags tags={item.tags} onTag={props.onTag} />
          </div>
        )}
        {item.auto && (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            Auto-ghosted by the rule “{item.auto.criteria}” (
            {Math.round(item.auto.confidence * 100)}% sure).
          </p>
        )}
        {item.excerpt && (
          <p className="whitespace-pre-line text-sm text-zinc-700 leading-relaxed dark:text-zinc-300">
            {item.excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              <ExternalLink className="size-4" /> Open original
            </a>
          )}
          <div className="ml-auto flex">{props.actions}</div>
        </div>
      </div>
    </>
  );
}

/**
 * The ghost viewer: overview, the full content (reader view) and AI (summary, questions).
 * `page` renders it as a whole page (opened in its own tab or window).
 */
export function ItemDetail(props: {
  item: GhostItem;
  actions?: ReactNode;
  onClose(): void;
  onTag?(tag: string): void;
  /** Shown when AI is on: re-generates summary and tags. */
  onRegenerate?(): void;
  aiEnabled?: boolean;
  page?: boolean;
  initialTab?: ViewerTab;
}) {
  const { item, onClose, page } = props;
  const [tab, setTab] = useState<ViewerTab>(props.initialTab ?? 'overview');
  const [wide, setWide] = useState(false);
  const grab = useContent(item);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, !page);
  useEffect(() => {
    if (page) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, page]);

  const openViewer = (target: Target) => {
    openUrl(viewerUrl(item.key, tab), target);
    if (!page) onClose();
  };

  const body = (
    <>
      <div className="sticky top-0 z-10 border-zinc-100 border-b bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex items-center gap-1 px-3 py-2">
          {page ? (
            <ToolButton label="Back to Ghostify" onClick={onClose}>
              <ArrowLeft className="size-4" />
            </ToolButton>
          ) : null}
          <span className="min-w-0 truncate px-1 text-xs text-zinc-500">{item.host}</span>
          <div className="ml-auto flex items-center">
            {item.url && (
              <>
                <ToolButton
                  label="Open original in a new tab"
                  onClick={() => openUrl(item.url as string, 'tab')}
                >
                  <ExternalLink className="size-4" />
                </ToolButton>
                <ToolButton
                  label="Open original in a new window"
                  onClick={() => openUrl(item.url as string, 'window')}
                >
                  <AppWindow className="size-4" />
                </ToolButton>
              </>
            )}
            {!page && (
              <>
                <ToolButton label="Open viewer in a new tab" onClick={() => openViewer('tab')}>
                  <PanelTop className="size-4" />
                </ToolButton>
                <ToolButton
                  label={wide ? 'Narrow viewer' : 'Widen viewer'}
                  onClick={() => setWide(!wide)}
                >
                  {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </ToolButton>
                <ToolButton label="Close" onClick={onClose}>
                  <X className="size-4" />
                </ToolButton>
              </>
            )}
            {page && (
              <ToolButton label="Open viewer in a new window" onClick={() => openViewer('window')}>
                <AppWindow className="size-4" />
              </ToolButton>
            )}
          </div>
        </div>
        <div role="tablist" aria-label="Viewer" className="flex gap-1 px-3">
          {TABS.map((t) => {
            const on = t.key === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium text-sm transition ${
                  on
                    ? 'border-ghost-500 text-ghost-700 dark:text-ghost-200'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'overview' && (
        <Overview
          item={item}
          actions={props.actions}
          onTag={props.onTag}
          onRegenerate={props.onRegenerate}
        />
      )}
      {tab === 'reader' && <ReaderView item={item} grab={grab} />}
      {tab === 'ask' && <AskPanel item={item} grab={grab} aiEnabled={!!props.aiEnabled} />}
    </>
  );

  if (page) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <main
          aria-label={item.title}
          className="mx-auto min-h-screen max-w-3xl bg-white shadow-sm dark:bg-zinc-950 dark:shadow-none"
        >
          {body}
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className={`relative flex outline-none h-full w-full flex-col overflow-y-auto bg-white shadow-2xl transition-[max-width] dark:bg-zinc-950 ${
          wide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {body}
      </aside>
    </div>
  );
}
