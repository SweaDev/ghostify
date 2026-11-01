const GHOST_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c-4.1 0-7 3.1-7 7.1v11.9l2-1.6 1.7 1.6 1.7-1.6 1.6 1.6 1.6-1.6 1.7 1.6 1.7-1.6 2 1.6V9.6c0-4-2.9-7.1-7-7.1z"/><ellipse cx="9.5" cy="10" rx="1.4" ry="1.8" fill="#1e1b4b"/><ellipse cx="14.5" cy="10" rx="1.4" ry="1.8" fill="#1e1b4b"/></svg>`;

const CSS = `
:host { all: initial; }
.btn {
  position: fixed; z-index: 2147483646; display: none; width: 34px; height: 34px; padding: 6px;
  border: 0; border-radius: 999px; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, #7c5cff, #3b82f6);
  box-shadow: 0 6px 18px rgba(76, 52, 200, .35), inset 0 0 0 1px rgba(255,255,255,.25);
  transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
  animation: float 2.4s ease-in-out infinite;
}
.btn.on { display: block; }
.btn:hover { transform: scale(1.12); box-shadow: 0 8px 24px rgba(76, 52, 200, .5); }
.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.btn svg { width: 100%; height: 100%; display: block; }
.btn.poof { animation: poof .35s ease forwards; }
@media (prefers-reduced-motion: reduce) { .btn, .btn.poof { animation: none; transition: none; } }
@keyframes float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -3px; } }
@keyframes poof { to { opacity: 0; transform: scale(1.6); filter: blur(2px); } }
.toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: 12px;
  font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #f4f2ff; background: #1e1b4b; box-shadow: 0 10px 30px rgba(0,0,0,.3);
}
.toast button {
  font: inherit; color: #b7a4ff; background: none; border: 0; cursor: pointer; padding: 0;
}
`;

export interface GhostButtonOptions {
  /** The feed item element for an element under the pointer, if any. */
  resolve(el: Element): Element | undefined;
  onGhost(target: Element): void | Promise<void>;
}

export interface GhostButton {
  host: HTMLElement;
  /** Currently targeted item element. */
  readonly target: Element | undefined;
  hide(): void;
  toast(message: string, action?: { label: string; run(): void }, ms?: number): void;
  destroy(): void;
}

/** One floating ghost button, positioned over the hovered feed item. Never touches feed nodes. */
export function mountGhostButton(doc: Document, opts: GhostButtonOptions): GhostButton {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const btn = doc.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.title = 'Ghostify';
  btn.setAttribute('aria-label', 'Ghostify this item');
  btn.innerHTML = GHOST_SVG;
  root.append(style, btn);
  doc.documentElement.append(host);

  let target: Element | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const place = () => {
    if (!target?.isConnected) return hide();
    const r = target.getBoundingClientRect();
    btn.style.top = `${Math.max(r.top + 8, 8)}px`;
    btn.style.left = `${r.right - 42}px`;
  };
  const show = (el: Element) => {
    target = el;
    btn.classList.add('on');
    place();
  };
  function hide() {
    target = undefined;
    btn.classList.remove('on', 'poof');
  }

  const onOver = (e: Event) => {
    if (e.composedPath().includes(host)) return;
    const el = e.target instanceof Element ? opts.resolve(e.target) : undefined;
    if (el) show(el);
    else if (!overTarget(e)) hide();
  };
  // Hover overlays outside the item (e.g. YouTube's inline preview player) keep the button.
  const overTarget = (e: Event) => {
    if (!target?.isConnected || !(e instanceof MouseEvent)) return false;
    const r = target.getBoundingClientRect();
    return (
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    );
  };
  let frame = 0;
  // Scroll fires many times per frame; reposition at most once per frame.
  const onScroll = () => {
    if (!target || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const onClick = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const el = target;
    if (!el) return;
    btn.classList.add('poof');
    await opts.onGhost(el);
    hide();
  };

  doc.addEventListener('pointerover', onOver, { passive: true });
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.defaultView?.addEventListener('resize', onScroll, { passive: true });
  btn.addEventListener('click', onClick);

  return {
    host,
    get target() {
      return target;
    },
    hide,
    toast(message, action, ms = 5000) {
      root.querySelector('.toast')?.remove();
      clearTimeout(toastTimer);
      const t = doc.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      t.append(message);
      if (action) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = action.label;
        b.addEventListener('click', () => {
          t.remove();
          action.run();
        });
        t.append(b);
      }
      root.append(t);
      toastTimer = setTimeout(() => t.remove(), ms);
    },
    destroy() {
      clearTimeout(toastTimer);
      cancelAnimationFrame(frame);
      doc.removeEventListener('pointerover', onOver);
      doc.removeEventListener('scroll', onScroll, { capture: true });
      doc.defaultView?.removeEventListener('resize', onScroll);
      host.remove();
    },
  };
}
