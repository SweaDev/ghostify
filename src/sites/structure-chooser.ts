import type { FeedDescriptor, ItemStructure, StructurePart } from 'feedgrab';
import { HIGHLIGHT_CSS, type HighlightKind, highlighter } from './highlight';
import {
  countMatching,
  hasRequired,
  partCoverage,
  partElement,
  partText,
  suggestParts,
} from './structure';
import { PANEL_CSS } from './view-chooser';

const CSS = `${PANEL_CSS}
.panel { width: 400px; max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; }
fieldset { border: 1px solid #e4e4e7; border-radius: 10px; padding: 8px 10px; margin: 0 0 8px; min-width: 0; }
legend { font-weight: 600; padding: 0 4px; }
.parts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.parts label { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: baseline; font-size: 12px; padding: 3px 4px; border-radius: 6px; }
.parts label:hover, .parts label:focus-within { background: #f4f4f5; }
.parts .what { font-weight: 600; }
.parts code { font: 11px ui-monospace, monospace; word-break: break-all; color: #52525b; }
.parts .text, .parts .cover { grid-column: 2; color: #71717a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.matches { margin: 6px 0 0; font-size: 12px; }
.matches.warn { color: #b45309; }
.again { margin-top: 6px; font-size: 12px; padding: 3px 8px; }
${HIGHLIGHT_CSS}`;

export interface StructureFeed {
  descriptor: FeedDescriptor;
  /** The feed's posts on the page, in order. */
  items: Element[];
  /** Index of the sample post chosen in the link step. */
  reference: number;
  /** Parts to start from (saved ones, or suggestions for the sample post). */
  parts: StructurePart[];
}

/** Structure per feed id (unset when it has no parts). */
export type StructureChoice = Record<string, ItemStructure | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const n = Object.assign(doc.createElement(tag), props);
  n.append(...children);
  return n;
}

/**
 * Asks which parts of the sample post every post must have. Ghostify's button then skips items
 * without them (ads, headings). Resolves null on cancel.
 */
export function chooseStructure(
  doc: Document,
  feeds: StructureFeed[],
): Promise<StructureChoice | null> {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-chooser', '');
  const root = host.attachShadow({ mode: 'open' });
  const panel = el(
    doc,
    'div',
    { className: 'panel' },
    el(doc, 'h2', {}, 'What does every post have?'),
    el(
      doc,
      'p',
      {},
      'Ghostify shows its button only on items that have every required part, so ads and headings that look like posts are left alone. Keep parts that only some posts have (a thumbnail, say) optional. Items without a required part are outlined in red.',
    ),
  );
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ghostify: post structure');
  root.append(el(doc, 'style', {}, CSS), panel);
  const marks = highlighter(doc, root);

  const parts: StructurePart[][] = feeds.map((f) => f.parts.map((p) => ({ ...p })));
  let hovered: Element | null = null;
  const mark = () => {
    const targets: { el: Element; kind: HighlightKind }[] = [];
    feeds.forEach((f, i) => {
      const structure = { parts: parts[i] ?? [] };
      if (hasRequired(structure))
        for (const it of f.items)
          if (!countMatching([it], structure)) targets.push({ el: it, kind: 'off' });
      const ref = f.items[f.reference];
      if (ref) targets.push({ el: ref, kind: 'sample' });
    });
    if (hovered) targets.push({ el: hovered, kind: 'part' });
    marks.set(targets);
  };

  feeds.forEach((f, i) => {
    const ref = f.items[f.reference];
    const list = el(doc, 'ul', { className: 'parts' });
    const matches = el(doc, 'p', { className: 'matches' });
    matches.setAttribute('role', 'status');
    const summarize = () => {
      const structure = { parts: parts[i] ?? [] };
      const n = countMatching(f.items, structure);
      const total = f.items.length;
      matches.className = `matches${hasRequired(structure) && n === 0 ? ' warn' : ''}`;
      matches.textContent = !hasRequired(structure)
        ? `No part is required, so the button shows on all ${total} items.`
        : n === 0
          ? `No item has every required part, so the button would show nowhere. Make some parts optional.`
          : `${n} of ${total} items have every required part.`;
      mark();
    };
    const renderList = () => {
      list.replaceChildren(
        ...(parts[i] ?? []).map((p, j) => {
          const box = el(doc, 'input', { type: 'checkbox', checked: p.required });
          box.setAttribute('aria-label', `Require ${p.label ?? 'part'} ${p.selector.value}`);
          box.addEventListener('change', () => {
            const cur = parts[i]?.[j];
            if (cur) cur.required = box.checked;
            summarize();
          });
          const text = ref ? partText(ref, p) : '';
          const label = el(
            doc,
            'label',
            {},
            box,
            el(
              doc,
              'span',
              {},
              el(doc, 'span', { className: 'what' }, p.label ?? 'part'),
              ' ',
              el(doc, 'code', {}, p.selector.value),
            ),
            ...(text ? [el(doc, 'span', { className: 'text' }, `“${text}”`)] : []),
            el(
              doc,
              'span',
              { className: 'cover' },
              `in ${partCoverage(f.items, p)} of ${f.items.length} posts`,
            ),
          );
          const show = (on: boolean) => {
            hovered = on && ref ? partElement(ref, p) : null;
            mark();
          };
          label.addEventListener('mouseenter', () => show(true));
          label.addEventListener('mouseleave', () => show(false));
          box.addEventListener('focus', () => show(true));
          box.addEventListener('blur', () => show(false));
          return el(doc, 'li', {}, label);
        }),
      );
      summarize();
    };
    const again = el(
      doc,
      'button',
      { type: 'button', className: 'again' },
      'Suggest again from the sample post',
    );
    again.addEventListener('click', () => {
      parts[i] = suggestParts(f.items, f.reference);
      renderList();
    });
    const box = el(doc, 'fieldset', {}, list, matches, again);
    if (feeds.length > 1) box.prepend(el(doc, 'legend', {}, `Feed ${i + 1}`));
    if (!f.parts.length)
      box.prepend(
        el(doc, 'p', {}, 'No parts found in the sample post; every item gets the button.'),
      );
    panel.append(box);
    renderList();
  });

  const cancel = el(doc, 'button', { type: 'button', className: 'cancel' }, 'Cancel');
  const next = el(doc, 'button', { type: 'button', className: 'primary next' }, 'Next');
  panel.append(el(doc, 'div', { className: 'row' }, cancel, next));
  doc.documentElement.append(host);

  return new Promise((resolve) => {
    const done = (v: StructureChoice | null) => {
      marks.destroy();
      host.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => done(null));
    next.addEventListener('click', () => {
      const out: StructureChoice = {};
      feeds.forEach((f, i) => {
        const p = parts[i] ?? [];
        out[f.descriptor.id] = p.length ? { parts: p } : undefined;
      });
      done(out);
    });
  });
}
