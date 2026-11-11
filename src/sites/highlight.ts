/** Box styles for highlighted page elements. */
export const HIGHLIGHT_CSS = `
.hl-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.hl { position: fixed; box-sizing: border-box; border-radius: 6px; }
.hl.sample { outline: 3px solid #7c5cff; background: rgba(124, 92, 255, 0.08); }
.hl.part { outline: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.15); }
.hl.off { outline: 2px dashed #ef4444; background: rgba(239, 68, 68, 0.06); }
`;

export type HighlightKind = 'sample' | 'part' | 'off';

export interface Highlighter {
  /** Replaces the highlighted elements. */
  set(targets: { el: Element; kind: HighlightKind }[]): void;
  destroy(): void;
}

/**
 * Draws boxes over page elements from inside `root` (a shadow root), following scroll and
 * resize, without touching the page's own nodes.
 */
export function highlighter(doc: Document, root: ShadowRoot): Highlighter {
  const win = doc.defaultView;
  const layer = doc.createElement('div');
  layer.className = 'hl-layer';
  root.prepend(layer);
  let targets: { el: Element; kind: HighlightKind }[] = [];
  let frame = 0;
  const draw = () => {
    frame = 0;
    layer.replaceChildren(
      ...targets
        .filter((t) => t.el.isConnected)
        .map(({ el, kind }) => {
          const r = el.getBoundingClientRect();
          const box = doc.createElement('div');
          box.className = `hl ${kind}`;
          Object.assign(box.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          });
          return box;
        }),
    );
  };
  const schedule = () => {
    if (!frame) frame = win?.requestAnimationFrame(draw) ?? 0;
  };
  win?.addEventListener('scroll', schedule, true);
  win?.addEventListener('resize', schedule);
  return {
    set(next) {
      targets = next;
      draw();
    },
    destroy() {
      if (frame) win?.cancelAnimationFrame(frame);
      win?.removeEventListener('scroll', schedule, true);
      win?.removeEventListener('resize', schedule);
      layer.remove();
    },
  };
}
