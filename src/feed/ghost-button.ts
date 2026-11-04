const GHOST_SVG = `<svg viewBox="0 0 24 24" overflow="visible" aria-hidden="true"><text x="12" y="12" font-size="20" text-anchor="middle" dominant-baseline="central" font-family='"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif'>👻</text></svg>`;

/** Item mist thickens before removal, then lifts off the reflowed feed. */
const VANISH_MS = 320;
const LIFT_MS = 420;

const CSS = `
:host { all: initial; }
.btn {
  position: fixed; z-index: 2147483646; display: none; width: 36px; height: 36px; padding: 6px;
  border: 0; border-radius: 999px; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, #7c5cff, #3b82f6);
  box-shadow: 0 6px 18px rgba(76, 52, 200, .35), inset 0 0 0 1px rgba(255,255,255,.25);
  transition: scale .15s ease, box-shadow .15s ease;
}
.btn.on { display: block; animation: appear .55s cubic-bezier(.2,.8,.3,1.25) both, float 2.4s ease-in-out .55s infinite; }
.btn:hover { scale: 1.12; box-shadow: 0 0 0 4px rgba(183,164,255,.25), 0 8px 26px rgba(124,92,255,.6); }
.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.btn svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 1px 1px rgba(30,27,75,.35)); }
.btn.poof { animation: depart .45s ease-in forwards; pointer-events: none; }
.aura {
  position: fixed; z-index: 2147483645; display: none; pointer-events: none; border-radius: 10px;
  background: linear-gradient(180deg, rgba(244,242,255,.22), rgba(183,164,255,.14));
  box-shadow: 0 0 0 1px rgba(183,164,255,.55), 0 0 32px 6px rgba(124,92,255,.35), inset 0 0 44px rgba(183,164,255,.4);
  backdrop-filter: grayscale(.55) brightness(1.04);
}
.aura.haunt, .aura.vanish, .aura.lift { display: block; }
.aura.haunt { animation: haunt .3s ease-out both, shimmer 2.2s ease-in-out .3s infinite; }
.aura.vanish { animation: mist .32s ease-in forwards; }
.aura.lift { animation: lift .42s ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .btn.on, .btn.poof, .aura.haunt, .aura.vanish, .aura.lift { animation: none; transition: none; }
}
@keyframes appear {
  0% { opacity: 0; transform: translateY(14px) scale(.5) rotate(-12deg); filter: blur(3px); }
  60% { opacity: .85; transform: translateY(-4px) scale(1.06) rotate(5deg); filter: blur(0); }
  100% { opacity: 1; transform: none; }
}
@keyframes float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -3px; } }
@keyframes depart { to { opacity: 0; transform: translateY(-28px) scale(1.3) rotate(8deg); filter: blur(3px); } }
@keyframes haunt { from { opacity: 0; } to { opacity: 1; } }
@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: .7; } }
@keyframes mist {
  to {
    background: linear-gradient(180deg, rgba(244,242,255,.8), rgba(214,204,255,.72));
    backdrop-filter: grayscale(1) blur(8px);
    box-shadow: 0 0 0 1px rgba(183,164,255,.3), 0 0 48px 14px rgba(124,92,255,.3), inset 0 0 60px rgba(255,255,255,.6);
  }
}
@keyframes lift {
  from {
    background: linear-gradient(180deg, rgba(244,242,255,.8), rgba(214,204,255,.72));
    backdrop-filter: grayscale(1) blur(8px);
  }
  to { opacity: 0; transform: translateY(-24px) scaleY(.85); filter: blur(6px); backdrop-filter: none; }
}
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

/**
 * One floating ghost button over the hovered feed item, plus an aura overlay that haunts the
 * item while the button is hovered and mists it away on click. Never touches feed nodes.
 */
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
  const aura = doc.createElement('div');
  aura.className = 'aura';
  root.append(style, aura, btn);
  doc.documentElement.append(host);

  let target: Element | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const reduced = () => !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced() ? 0 : ms));

  const place = () => {
    if (!target?.isConnected) return hide();
    const r = target.getBoundingClientRect();
    btn.style.top = `${Math.max(r.top + 8, 8)}px`;
    btn.style.left = `${r.right - 42}px`;
    Object.assign(aura.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  const show = (el: Element) => {
    if (el === target && btn.classList.contains('on')) return place();
    target = el;
    aura.classList.remove('haunt');
    // Restart the rise-in animation for each newly hovered item.
    btn.classList.remove('on');
    void btn.offsetWidth;
    btn.classList.add('on');
    place();
  };
  function hide() {
    target = undefined;
    btn.classList.remove('on', 'poof');
    aura.classList.remove('haunt', 'vanish', 'lift');
  }
  const haunt = (on: boolean) => {
    if (!busy && target) aura.classList.toggle('haunt', on);
  };

  const onOver = (e: Event) => {
    if (busy || e.composedPath().includes(host)) return;
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
    if (!target || busy || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const onClick = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const el = target;
    if (!el || busy) return;
    busy = true;
    btn.classList.add('poof');
    aura.classList.remove('haunt');
    aura.classList.add('vanish');
    await wait(VANISH_MS);
    try {
      // onGhost removes the item synchronously; the mist then lifts off whatever reflows in.
      const done = opts.onGhost(el);
      aura.classList.replace('vanish', 'lift');
      await Promise.all([done, wait(LIFT_MS)]);
    } finally {
      busy = false;
      hide();
    }
  };

  doc.addEventListener('pointerover', onOver, { passive: true });
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.defaultView?.addEventListener('resize', onScroll, { passive: true });
  btn.addEventListener('click', onClick);
  btn.addEventListener('pointerenter', () => haunt(true));
  btn.addEventListener('pointerleave', () => haunt(false));
  btn.addEventListener('focus', () => haunt(true));
  btn.addEventListener('blur', () => haunt(false));

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
