import { type RefObject, useEffect } from 'react';

/** Moves focus into a dialog when it opens and back to where it was when it closes. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, [ref, active]);
}
