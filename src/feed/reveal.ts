import { HIGHLIGHT_CSS, highlighter } from '../sites/highlight';

const PICKING_ATTR = 'data-ghostify-picking';
const PICKING_EVENT = 'ghostify:picking';

/**
 * Tells the page's feed runtime (another content script on the same document) that the
 * picker started or stopped, so it shows or hides ghostified items.
 */
export function setPicking(doc: Document, active: boolean): void {
  doc.documentElement.toggleAttribute(PICKING_ATTR, active);
  doc.dispatchEvent(new CustomEvent(PICKING_EVENT));
}

export const isPicking = (doc: Document) => doc.documentElement.hasAttribute(PICKING_ATTR);

/** Calls `cb` with the picking state whenever it changes; returns an unsubscribe. */
export function onPicking(doc: Document, cb: (active: boolean) => void): () => void {
  const listener = () => cb(isPicking(doc));
  doc.addEventListener(PICKING_EVENT, listener);
  return () => doc.removeEventListener(PICKING_EVENT, listener);
}

export interface Veil {
  set(elements: Element[]): void;
  destroy(): void;
}

/** Blurred boxes labelled "Ghostified" over items, in their own shadow root (page nodes untouched). */
export function veil(doc: Document): Veil {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-veil', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = HIGHLIGHT_CSS;
  root.append(style);
  doc.documentElement.append(host);
  const marks = highlighter(doc, root);
  return {
    set: (elements) =>
      marks.set(elements.map((el) => ({ el, kind: 'ghost', label: 'Ghostified' }))),
    destroy() {
      marks.destroy();
      host.remove();
    },
  };
}
