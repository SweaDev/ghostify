import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastAction {
  label: string;
  run(): void;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

/** One toast at a time (newest wins), hidden after `ms`. */
export function useToast(ms = 6000) {
  const [toast, setToast] = useState<ToastState>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback(
    (message: string, action?: ToastAction) => {
      clearTimeout(timer.current);
      setToast({ id: Date.now(), message, action });
      timer.current = setTimeout(() => setToast(undefined), ms);
    },
    [ms],
  );
  const hide = useCallback(() => setToast(undefined), []);
  const view = toast && (
    <div
      key={toast.id}
      role="status"
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900"
    >
      {toast.message}
      {toast.action && (
        <button
          type="button"
          className="font-semibold text-ghost-300 hover:underline dark:text-ghost-600"
          onClick={() => {
            hide();
            toast.action?.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
  return { show, hide, view };
}
