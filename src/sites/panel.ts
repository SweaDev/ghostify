import { storage } from 'wxt/utils/storage';

/** Shared look of the picker's panels (shadow-root CSS). */
export const PANEL_CSS = `
:host { all: initial; }
.panel {
  --bg: #fff; --fg: #18181b; --muted: #52525b; --faint: #71717a; --line: #e4e4e7;
  --field: #fff; --hover: #f4f2ff; --accent: #7c5cff; --accent-soft: #f1edff;
  position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: 320px;
  max-height: calc(100vh - 32px); overflow: auto; overscroll-behavior: contain; box-sizing: border-box;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg);
  background: var(--bg); border: 1px solid #d6ccff; border-radius: 14px; padding: 0 16px 16px;
  box-shadow: 0 24px 48px -12px rgba(30, 27, 75, .35), 0 2px 6px rgba(30, 27, 75, .08);
}
.panel.plain { padding-top: 16px; }
@media (prefers-color-scheme: dark) {
  .panel {
    --bg: #18181b; --fg: #f4f4f5; --muted: #d4d4d8; --faint: #a1a1aa; --line: #3f3f46;
    --field: #27272a; --hover: #2a2445; --accent-soft: #231d3d; border-color: #4c3d99;
  }
}
.bar {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
  margin: 0 -16px 12px; padding: 6px 6px 6px 12px; background: var(--accent-soft);
  border-bottom: 1px solid var(--line); cursor: grab; user-select: none; touch-action: none;
}
.bar:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.bar.dragging { cursor: grabbing; }
.grip { color: var(--faint); font-size: 14px; line-height: 1; letter-spacing: -1px; }
.step { flex: 1; color: var(--accent); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.bar button { border: 0; background: transparent; padding: 2px 8px; color: var(--muted); font-size: 15px; line-height: 1; }
.bar button:hover { background: var(--hover); }
.panel.collapsed { padding-bottom: 0; overflow: hidden; }
.panel.collapsed .bar { margin-bottom: 0; border-bottom: 0; }
.panel.collapsed > :not(.bar) { display: none !important; }
h2 { margin: 0 0 4px; font-size: 15px; }
p { margin: 0 0 10px; color: var(--muted); }
label { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
label:hover { background: var(--hover); }
.ind { margin-top: 8px; padding: 8px; border-radius: 8px; background: var(--accent-soft); }
.ind code { word-break: break-all; font-size: 12px; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
button {
  font: inherit; border-radius: 8px; padding: 6px 12px; cursor: pointer; color: var(--fg);
  border: 1px solid var(--line); background: var(--field); transition: border-color .15s, background .15s;
}
button:hover { border-color: var(--accent); }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.primary:hover { background: #6a48f5; }
`;

type Position = { left: number; top: number };

/** Where the user last dragged the picker panel, per site. */
const positions = storage.defineItem<Record<string, Position>>('local:pickerPanel', {
  fallback: {},
});

/** Where a picker panel was last left (`key`: the site, plus the panel for feedgrab's). */
export const panelPosition = async (key: string): Promise<Position | undefined> =>
  (await positions.getValue())[key];

export async function savePanelPosition(key: string, p: Position): Promise<void> {
  await positions.setValue({ ...(await positions.getValue()), [key]: p });
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
/** Pixels an arrow key moves the panel. */
const STEP_PX = 24;

/**
 * Gives a `.panel` a header with its step, a drag handle and a collapse button, and puts it
 * where the user last left it on this site. Returns a cleanup for when the panel goes.
 */
export function framePanel(panel: HTMLElement, step: string): () => void {
  const doc = panel.ownerDocument;
  const win = doc.defaultView;
  const site = win?.location.hostname ?? '';
  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.tabIndex = 0;
  bar.title = 'Drag to move (or use the arrow keys)';
  const grip = Object.assign(doc.createElement('span'), { className: 'grip', textContent: '⋮⋮' });
  const label = Object.assign(doc.createElement('span'), { className: 'step', textContent: step });
  const fold = Object.assign(doc.createElement('button'), { type: 'button', className: 'fold' });
  bar.append(grip, label, fold);
  panel.prepend(bar);

  const setFolded = (folded: boolean) => {
    panel.classList.toggle('collapsed', folded);
    fold.textContent = folded ? '+' : '–';
    fold.setAttribute('aria-label', folded ? 'Expand panel' : 'Collapse panel');
    fold.setAttribute('aria-expanded', String(!folded));
  };
  setFolded(false);
  fold.addEventListener('click', () => setFolded(!panel.classList.contains('collapsed')));

  const place = (left: number, top: number) => {
    const r = panel.getBoundingClientRect();
    const w = win?.innerWidth ?? 0;
    const h = win?.innerHeight ?? 0;
    panel.style.left = `${clamp(left, 0, Math.max(0, w - r.width))}px`;
    panel.style.top = `${clamp(top, 0, Math.max(0, h - 40))}px`;
    panel.style.right = 'auto';
  };
  const save = () => {
    const r = panel.getBoundingClientRect();
    // An orphaned content script can't save: the position just isn't kept.
    savePanelPosition(site, { left: r.left, top: r.top }).catch(() => {});
  };
  let moved = false;
  panelPosition(site)
    .then((p) => {
      if (p && !moved) place(p.left, p.top);
    })
    .catch(() => {});

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    moved = true;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    bar.setPointerCapture?.(e.pointerId);
    bar.classList.add('dragging');
    const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      bar.classList.remove('dragging');
      save();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
  bar.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ];
    if (!d || e.target !== bar) return;
    e.preventDefault();
    moved = true;
    const r = panel.getBoundingClientRect();
    place(r.left + (d[0] ?? 0) * STEP_PX, r.top + (d[1] ?? 0) * STEP_PX);
    save();
  });

  // Keep a moved panel on screen when the window shrinks.
  const onResize = () => {
    if (!panel.style.left) return;
    const r = panel.getBoundingClientRect();
    place(r.left, r.top);
  };
  win?.addEventListener('resize', onResize);
  return () => win?.removeEventListener('resize', onResize);
}
