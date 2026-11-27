/**
 * Box styles for the "Ghostified" veil (Ghostify's own UX; page outlines while grabbing use
 * feedgrab's highlighter). Unlike feedgrab's, it draws without layout too, so tests can see it.
 */
export const HIGHLIGHT_CSS = `
.hl-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.hl { position: fixed; box-sizing: border-box; border-radius: 6px; }
.hl.ghost {
  outline: 1px dashed rgba(124, 92, 255, 0.8); background: rgba(124, 92, 255, 0.12);
  backdrop-filter: blur(6px) saturate(0.6); -webkit-backdrop-filter: blur(6px) saturate(0.6);
}
.hl-label {
  position: absolute; top: 6px; left: 6px; padding: 3px 8px; border-radius: 999px;
  font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; background: #7c5cff;
  box-shadow: 0 2px 6px rgba(30, 27, 75, 0.3);
}
`;

export type HighlightKind = 'ghost';

export interface HighlightTarget {
  el: Element;
  kind: HighlightKind;
  /** Text shown in the box's corner. */
  label?: string;
}

export interface Highlighter {
  /** Replaces the highlighted elements. */
  set(targets: HighlightTarget[]): void;
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
  let targets: HighlightTarget[] = [];
  let frame = 0;
  const draw = () => {
    frame = 0;
    layer.replaceChildren(
      ...targets
        .filter((t) => t.el.isConnected)
        .map(({ el, kind, label }) => {
          const r = el.getBoundingClientRect();
          const box = doc.createElement('div');
          box.className = `hl ${kind}`;
          Object.assign(box.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          });
          if (label) {
            const tag = doc.createElement('span');
            tag.className = 'hl-label';
            tag.textContent = label;
            box.append(tag);
          }
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
