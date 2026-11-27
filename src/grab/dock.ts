import { storage } from 'wxt/utils/storage';
import type { DockPrefs, DockSide } from './protocol';

export const DOCK_DEFAULT: DockPrefs = { side: 'right', size: 400 };
const dockItem = storage.defineItem<DockPrefs>('local:grabDock', { fallback: DOCK_DEFAULT });
const MIN = 300;

export const loadDock = () => dockItem.getValue().catch(() => DOCK_DEFAULT);
export const saveDockPrefs = (p: DockPrefs) => dockItem.setValue(p).catch(() => {});

/** Panel size kept between `MIN` and 85% of the viewport along the docked side. */
export function clampSize(
  side: DockSide,
  size: number,
  win: { innerWidth: number; innerHeight: number },
) {
  const max = Math.round((side === 'bottom' ? win.innerHeight : win.innerWidth) * 0.85);
  return Math.max(MIN, Math.min(max, Math.round(size)));
}

// Page outlines drawn by feedgrab's highlighter (`fd-box fd-<kind>`, `fd-label`) in the dock's layer.
const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.fd-box { position: fixed; box-sizing: border-box; pointer-events: none; border-radius: 6px;
  outline: 2px solid #3b82f6; outline-offset: 1px; }
.fd-box.fd-feed { outline: 2px dashed #7c5cff; background: rgba(124, 92, 255, 0.04); }
.fd-box.fd-item { outline-color: rgba(59, 130, 246, 0.7); }
.fd-box.fd-hover { outline: 3px solid #7c5cff; background: rgba(124, 92, 255, 0.08); }
.fd-box.fd-part { outline: 2px solid #f59e0b; background: rgba(245, 158, 11, 0.12); }
.fd-box.fd-excluded { outline-color: #ef4444; }
.fd-label { position: absolute; top: 0; left: 0; transform: translateY(-100%); padding: 1px 6px;
  font: 600 11px/1.5 system-ui, sans-serif; color: #fff; background: #7c5cff; border-radius: 4px 4px 0 0;
  white-space: nowrap; }
.dock { position: fixed; z-index: 2147483647; display: flex; background: transparent;
  box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 12px 40px rgba(0,0,0,.25); }
.dock.right { top: 0; right: 0; bottom: 0; flex-direction: row; }
.dock.left { top: 0; left: 0; bottom: 0; flex-direction: row-reverse; }
.dock.bottom { left: 0; right: 0; bottom: 0; flex-direction: column; }
.dock[hidden] { display: none; }
.grip { flex: none; background: transparent; touch-action: none; }
.dock.right .grip, .dock.left .grip { width: 6px; cursor: ew-resize; }
.dock.bottom .grip { height: 6px; cursor: ns-resize; }
.grip:hover, .grip.active { background: rgba(124, 92, 255, 0.5); }
iframe { flex: 1; border: 0; width: 100%; height: 100%; color-scheme: normal; background: transparent; }
`;

export interface Dock {
  host: HTMLElement;
  /** Where page outlines are drawn. */
  layer: HTMLElement;
  setPrefs(p: DockPrefs): void;
  hide(): void;
  show(): void;
  destroy(): void;
}

/**
 * The Grab panel docked in the page: one host element with a shadow root holding the panel's
 * iframe (an extension page), a resize grip and the outline layer. Page nodes are never touched.
 */
export function mountDock(
  doc: Document,
  opts: { src: string; prefs: DockPrefs; onResize(size: number): void },
): Dock {
  const win = doc.defaultView as Window;
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-grab', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const layer = doc.createElement('div');
  layer.className = 'layer';
  const dock = doc.createElement('div');
  const grip = doc.createElement('div');
  grip.className = 'grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-label', 'Resize the Ghostify panel');
  const frame = doc.createElement('iframe');
  frame.src = opts.src;
  frame.title = 'Ghostify: grab feeds';
  frame.allow = 'clipboard-write';
  dock.append(grip, frame);
  root.append(style, layer, dock);
  doc.documentElement.append(host);

  let prefs = opts.prefs;
  const place = () => {
    const size = clampSize(prefs.side, prefs.size, win);
    dock.className = `dock ${prefs.side}`;
    dock.style.width = prefs.side === 'bottom' ? '' : `${size}px`;
    dock.style.height = prefs.side === 'bottom' ? `${size}px` : '';
  };
  place();

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('active');
    frame.style.pointerEvents = 'none';
    const move = (ev: PointerEvent) => {
      const size =
        prefs.side === 'right'
          ? win.innerWidth - ev.clientX
          : prefs.side === 'left'
            ? ev.clientX
            : win.innerHeight - ev.clientY;
      prefs = { ...prefs, size: clampSize(prefs.side, size, win) };
      place();
    };
    const up = () => {
      grip.classList.remove('active');
      frame.style.pointerEvents = '';
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      opts.onResize(prefs.size);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  const onWinResize = () => place();
  win.addEventListener('resize', onWinResize);

  return {
    host,
    layer,
    setPrefs(p) {
      prefs = p;
      place();
    },
    hide() {
      dock.hidden = true;
    },
    show() {
      dock.hidden = false;
    },
    destroy() {
      win.removeEventListener('resize', onWinResize);
      host.remove();
    },
  };
}
