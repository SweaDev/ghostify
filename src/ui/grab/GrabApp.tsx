import { Loader2 } from 'lucide-react';
import { GhostIcon } from '../GhostIcon';
import { GrabView } from './GrabView';
import { useGrab } from './useGrab';

const CLOSED = {
  saved: 'Saved. The page reloads with the new feeds.',
  cancelled: 'Closed without saving.',
  lost: 'The page this panel belonged to went away. Open Ghostify on the page again.',
};

/** The Grab panel page (`grab.html`), docked in the page or in its own window. */
export function GrabApp() {
  const { state, closed, send } = useGrab();
  if (closed || !state) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
        <GhostIcon className="size-10" />
        {closed ? CLOSED[closed] : <Loader2 className="size-5 animate-spin" />}
      </div>
    );
  }
  return <GrabView state={state} send={send} />;
}
