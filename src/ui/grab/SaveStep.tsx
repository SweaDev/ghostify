import { MousePointerClick, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GrabCommand, GrabState } from '../../grab/protocol';
import type { View } from '../../sites/model';
import { btn, btnQuiet, field } from '../kit';
import { Advanced } from './bits';

const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: 'any', label: 'Any view', hint: 'logged in or out' },
  { value: 'loggedOut', label: 'Logged out', hint: 'only when you are logged out' },
  { value: 'loggedIn', label: 'Logged in', hint: 'only when you are logged in' },
];

/** Step 3: which pages and which view the feeds apply to, and thumbnails. */
export function SaveStep(props: {
  state: GrabState;
  send(c: GrabCommand): void;
  thumbnails: boolean;
  onThumbnails(on: boolean): void;
}) {
  const { state, send } = props;
  const [path, setPath] = useState(state.pathPattern);
  useEffect(() => setPath(state.pathPattern), [state.pathPattern]);
  const hosts = state.imageOrigins.map((o) => o.replace(/^https?:\/\//, '').replace(/\/\*$/, ''));
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-sm">Pages</span>
        <input
          aria-label="Page path pattern"
          value={path}
          spellCheck={false}
          onChange={(e) => setPath(e.target.value)}
          onBlur={() => send({ type: 'setPath', pattern: path })}
          className={`${field} font-mono`}
        />
        <span className="text-zinc-500 dark:text-zinc-400">
          <code>*</code> matches one path segment, <code>**</code> any number (e.g.{' '}
          <code>/top/*</code>).
        </span>
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-medium text-sm">View</legend>
        {VIEWS.map((v) => (
          <label key={v.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="view"
              checked={state.view === v.value}
              onChange={() => send({ type: 'setView', view: v.value })}
              className="accent-ghost-500"
            />
            {v.label} <span className="text-xs text-zinc-500">{v.hint}</span>
          </label>
        ))}
      </fieldset>
      {state.view !== 'any' && (
        <Advanced id="save" label="Login indicator">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            An element shown only in this view (your avatar, a Log in link) tells Ghostify which
            view it is.
          </p>
          {state.indicator ? (
            <span className="flex items-center gap-2 text-xs">
              <code className="min-w-0 flex-1 truncate">{state.indicator.selector}</code>
              <button
                type="button"
                aria-label="Clear indicator"
                className={btnQuiet}
                onClick={() => send({ type: 'clearIndicator' })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : null}
          <button type="button" className={btn} onClick={() => send({ type: 'pickIndicator' })}>
            <MousePointerClick className="size-4" /> Pick the element
          </button>
        </Advanced>
      )}
      {hosts.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.thumbnails}
            onChange={(e) => props.onThumbnails(e.target.checked)}
            className="mt-1 accent-ghost-500"
          />
          <span>
            Keep small thumbnails
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              Asks to fetch images from {hosts.join(', ')}. Media and PDFs are never downloaded.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
