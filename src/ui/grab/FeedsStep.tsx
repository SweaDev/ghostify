import { Eye, MousePointerClick, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { GrabCommand, GrabState } from '../../grab/protocol';
import { btn, btnQuiet, field } from '../kit';
import { Advanced, SelectorInput, TypeBadge } from './bits';

/** Step 1: the page's feeds, which to keep, and (advanced) their selectors and rules. */
export function FeedsStep({ state, send }: { state: GrabState; send(c: GrabCommand): void }) {
  const selected = state.feeds.find((f) => f.id === state.selected);
  const [rule, setRule] = useState('');
  const [criteria, setCriteria] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Tick the feeds Ghostify should read on this page. Outlines on the page show where they are.
      </p>
      {state.feeds.length === 0 && (
        <p className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          No feed found yet. Use <b>Pick on the page</b> and click one of its items.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {state.feeds.map((f, i) => (
          <li
            key={f.id}
            className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
              f.id === state.selected
                ? 'border-ghost-400 bg-ghost-50/60 dark:border-ghost-600 dark:bg-ghost-900/30'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <input
              type="checkbox"
              checked={f.accepted}
              aria-label={`Keep feed ${i + 1}`}
              onChange={() => send({ type: 'toggle', id: f.id })}
              className="size-4 accent-ghost-500"
            />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => send({ type: 'select', id: f.id })}
            >
              <span className="flex items-center gap-2 font-medium text-sm">
                Feed {i + 1} <TypeBadge type={f.type} />
              </span>
              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                {f.items} items · {f.source} · {Math.round(f.confidence * 100)}% sure
              </span>
            </button>
            <button
              type="button"
              title="Scroll to it"
              aria-label={`Show feed ${i + 1}`}
              className={btnQuiet}
              onClick={() => send({ type: 'show', id: f.id })}
            >
              <Eye className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={btn}
        disabled={!!state.picking}
        onClick={() => send({ type: 'inspect' })}
      >
        <MousePointerClick className="size-4" /> Pick on the page
      </button>
      {selected && (
        <Advanced id="feeds">
          <SelectorInput
            label="Container"
            value={selected.container}
            onApply={(container) =>
              send({ type: 'setSelectors', id: selected.id, container, item: selected.item })
            }
          />
          <SelectorInput
            label="Item (relative to the container)"
            value={selected.item}
            onApply={(item) =>
              send({ type: 'setSelectors', id: selected.id, container: selected.container, item })
            }
          />
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Skip items matching</span>
            {selected.exclude.map((r, i) => (
              <span
                key={r.kind === 'selector' ? `s:${r.selector.value}` : `t:${r.criteria}`}
                className="flex items-center gap-1"
              >
                <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                  {r.kind === 'selector' ? r.selector.value : `AI: ${r.criteria}`}
                </code>
                <button
                  type="button"
                  aria-label="Remove rule"
                  className={btnQuiet}
                  onClick={() =>
                    send({ type: 'removeRule', id: selected.id, list: 'exclude', index: i })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
            <span className="flex gap-1">
              <input
                value={rule}
                placeholder=".promoted, [data-ad]"
                onChange={(e) => setRule(e.target.value)}
                className={`${field} min-w-0 flex-1 font-mono text-xs`}
              />
              <button
                type="button"
                className={btn}
                onClick={() => {
                  send({
                    type: 'addRule',
                    id: selected.id,
                    list: 'exclude',
                    selector: { type: 'css', value: rule },
                  });
                  setRule('');
                }}
              >
                Add
              </button>
            </span>
            <span className="flex gap-1">
              <input
                value={criteria}
                placeholder="AI rule, e.g. sponsored posts"
                onChange={(e) => setCriteria(e.target.value)}
                className={`${field} min-w-0 flex-1 text-xs`}
              />
              <button
                type="button"
                className={btn}
                onClick={() => {
                  send({ type: 'addCriteria', id: selected.id, criteria });
                  setCriteria('');
                }}
              >
                Add
              </button>
            </span>
          </div>
        </Advanced>
      )}
    </div>
  );
}
