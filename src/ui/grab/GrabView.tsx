import { Check, ExternalLink, Loader2, PanelBottom, PanelLeft, PanelRight, X } from 'lucide-react';
import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { DockSide, GrabCommand, GrabState, GrabStep } from '../../grab/protocol';
import { GhostIcon } from '../GhostIcon';
import { btn, btnPrimary, btnQuiet } from '../kit';
import { ContentStep } from './ContentStep';
import { FeedsStep } from './FeedsStep';
import { SaveStep } from './SaveStep';

const STEPS: { key: GrabStep; label: string }[] = [
  { key: 'feeds', label: 'Feeds' },
  { key: 'content', label: 'Content' },
  { key: 'save', label: 'Save' },
];
const SIDES: { side: DockSide; label: string; Icon: typeof PanelRight }[] = [
  { side: 'left', label: 'Dock left', Icon: PanelLeft },
  { side: 'bottom', label: 'Dock to the bottom', Icon: PanelBottom },
  { side: 'right', label: 'Dock right', Icon: PanelRight },
];

const PICKING: Record<string, string> = {
  feed: 'Click an item of the feed on the page.',
  indicator: 'Click an element shown only in this view.',
};

/** The Grab panel: three steps over the page agent's state, docked in the page or in a window. */
export function GrabView({ state, send }: { state: GrabState; send(c: GrabCommand): void }) {
  const [thumbnails, setThumbnails] = useState(true);
  const at = STEPS.findIndex((s) => s.key === state.step);
  const go = (step: GrabStep) => send({ type: 'step', step });
  const save = async () => {
    // Ask first thing in the click: browsers only prompt during a user gesture.
    if (thumbnails && state.imageOrigins.length)
      await browser.permissions.request({ origins: state.imageOrigins }).catch(() => false);
    send({ type: 'save', thumbnails });
  };
  const docked = state.dock.mode === 'docked';
  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center gap-2 border-zinc-200 border-b px-3 py-2 dark:border-zinc-800">
        <GhostIcon className="size-6" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-tight">
            {state.editing ? 'Edit feeds' : 'Grab feeds'}
          </div>
          <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{state.host}</div>
        </div>
        {docked &&
          SIDES.map(({ side, label, Icon }) => (
            <button
              key={side}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={state.dock.side === side}
              className={`${btnQuiet} px-1.5 aria-pressed:text-ghost-600 dark:aria-pressed:text-ghost-300`}
              onClick={() => send({ type: 'dock', side })}
            >
              <Icon className="size-4" />
            </button>
          ))}
        {docked && (
          <button
            type="button"
            title="Open in its own window"
            aria-label="Open in its own window"
            className={`${btnQuiet} px-1.5`}
            onClick={() => send({ type: 'popOut' })}
          >
            <ExternalLink className="size-4" />
          </button>
        )}
        <button
          type="button"
          title="Close without saving"
          aria-label="Close without saving"
          className={`${btnQuiet} px-1.5`}
          onClick={() => send({ type: 'cancel' })}
        >
          <X className="size-4" />
        </button>
      </header>
      <nav aria-label="Steps" className="flex gap-1 px-3 pt-3">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-current={s.key === state.step ? 'step' : undefined}
            onClick={() => go(s.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium text-xs transition ${
              s.key === state.step
                ? 'bg-ghost-500 text-white shadow-sm'
                : i < at
                  ? 'bg-ghost-50 text-ghost-700 dark:bg-ghost-900/40 dark:text-ghost-200'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
            }`}
          >
            {i < at ? <Check className="size-3.5" /> : <span>{i + 1}</span>} {s.label}
          </button>
        ))}
      </nav>
      {state.picking && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-ghost-500 px-3 py-2 text-sm text-white">
          <span className="flex-1">
            {PICKING[state.picking] ?? 'Click it inside the outlined sample item.'}
          </span>
          <button
            type="button"
            className="rounded-md bg-white/20 px-2 py-0.5 text-xs"
            onClick={() => send({ type: 'cancelPick' })}
          >
            Cancel
          </button>
        </div>
      )}
      {state.error && (
        <div
          role="alert"
          className="mx-3 mt-3 rounded-xl bg-rose-50 px-3 py-2 text-rose-700 text-sm dark:bg-rose-950/50 dark:text-rose-300"
        >
          {state.error}
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto p-3">
        {state.busy ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" /> {state.busy}
          </p>
        ) : state.step === 'feeds' ? (
          <FeedsStep state={state} send={send} />
        ) : state.step === 'content' ? (
          <ContentStep state={state} send={send} />
        ) : (
          <SaveStep
            state={state}
            send={send}
            thumbnails={thumbnails}
            onThumbnails={setThumbnails}
          />
        )}
      </main>
      <footer className="flex items-center gap-2 border-zinc-200 border-t px-3 py-2 dark:border-zinc-800">
        {at > 0 && (
          <button type="button" className={btn} onClick={() => go(STEPS[at - 1]?.key ?? 'feeds')}>
            Back
          </button>
        )}
        <span className="flex-1 text-[11px] text-zinc-500">
          {state.feeds.filter((f) => f.accepted).length} feed(s) ticked
        </span>
        {state.step === 'save' ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={!!state.busy}
            onClick={() => void save()}
          >
            Save and reload
          </button>
        ) : (
          <button
            type="button"
            className={btnPrimary}
            onClick={() => go(STEPS[at + 1]?.key ?? 'save')}
          >
            Next
          </button>
        )}
      </footer>
    </div>
  );
}
