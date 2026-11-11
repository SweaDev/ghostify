import type { FeedDescriptor, PermalinkCandidate, Selector } from 'feedgrab';
import {
  checkFeed,
  linkParams,
  optionIndex,
  optionLabel,
  type PostLink,
  paramOptions,
  toggleParam,
  withPostLink,
} from './links';
import { PANEL_CSS } from './view-chooser';

const CSS = `${PANEL_CSS}
.panel { width: 380px; max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; }
fieldset { border: 1px solid #e4e4e7; border-radius: 10px; padding: 8px 10px; margin: 0 0 8px; }
legend { font-weight: 600; padding: 0 4px; }
select, input { font: inherit; box-sizing: border-box; border: 1px solid #d4d4d8; border-radius: 8px; padding: 5px 8px; background: #fff; color: inherit; }
.choice { width: 100%; }
.sel { display: flex; gap: 6px; margin-top: 6px; }
.sel input { flex: 1; min-width: 0; font: 12px ui-monospace, monospace; }
.opens { margin: 6px 0 0; font-size: 12px; word-break: break-all; }
.params { margin: 6px 0 0; font-size: 12px; }
.params p { margin: 0 0 2px; }
.params label { display: flex; gap: 6px; align-items: baseline; word-break: break-all; }
.params code { font: 12px ui-monospace, monospace; }
.params .note { color: #71717a; }
`;

export interface LinkFeed {
  descriptor: FeedDescriptor;
  /** feedgrab's ranked suggestions from the feed's first items. */
  options: PermalinkCandidate[];
  /** Pre-selected post link (empty selector = automatic). */
  link: PostLink;
}

/** Post link per feed id (empty selector = automatic). */
export type LinkChoice = Record<string, PostLink>;

const AUTO = 'auto';
const CUSTOM = 'custom';

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

/** Asks which link in each feed's items is the post's URL. Resolves null on cancel. */
export function chooseLinks(
  doc: Document,
  base: string,
  feeds: LinkFeed[],
): Promise<LinkChoice | null> {
  const host = doc.createElement('div');
  host.setAttribute('data-ghostify-chooser', '');
  const root = host.attachShadow({ mode: 'open' });
  const panel = el(
    doc,
    'div',
    { className: 'panel' },
    el(doc, 'h2', {}, 'Which link opens a post?'),
    el(
      doc,
      'p',
      {},
      'Ghostify saves this link with each post you ghostify and uses it to recognise the post. The choices come from the first post in the feed. You can also edit the selector, which is relative to the post, and choose which of the link’s query parameters identify the post.',
    ),
  );
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ghostify: post link');
  const style = el(doc, 'style', {}, CSS);
  root.append(style, panel);

  const chosen: PostLink[] = feeds.map((f) => ({ ...f.link, selector: { ...f.link.selector } }));
  feeds.forEach((f, i) => {
    const choice = el(doc, 'select', { className: 'choice' });
    choice.setAttribute('aria-label', `Post link${feeds.length > 1 ? ` (feed ${i + 1})` : ''}`);
    f.options.forEach((o, j) => {
      choice.append(el(doc, 'option', { value: String(j) }, optionLabel(o, base)));
    });
    choice.append(
      el(doc, 'option', { value: CUSTOM }, 'Custom selector'),
      el(doc, 'option', { value: AUTO }, 'Automatic'),
    );
    const type = el(
      doc,
      'select',
      {},
      el(doc, 'option', { value: 'css' }, 'CSS'),
      el(doc, 'option', { value: 'xpath' }, 'XPath'),
    );
    type.setAttribute('aria-label', 'Selector type');
    const input = el(doc, 'input', { spellcheck: false, placeholder: 'Automatic' });
    input.setAttribute('aria-label', 'Link selector');
    const opens = el(doc, 'p', { className: 'opens' });
    const params = el(doc, 'div', { className: 'params' });
    /** A new link has its own query parameters, so a selector change keeps all of them again. */
    const setSelector = (selector: Selector) => {
      chosen[i] = { selector };
    };

    const renderParams = (d: FeedDescriptor, items: ReturnType<typeof checkFeed>['items']) => {
      const link = chosen[i] as PostLink;
      const options = paramOptions(linkParams(items, d, base), link.params);
      params.replaceChildren();
      if (!options.length) return;
      params.append(
        el(doc, 'p', {}, 'Query parameters that identify a post (untick tracking ones):'),
      );
      for (const o of options) {
        const box = el(doc, 'input', { type: 'checkbox', checked: o.kept });
        box.setAttribute('aria-label', `Keep ${o.name}`);
        box.dataset.name = o.name;
        box.addEventListener('change', () => {
          const next = toggleParam(options, o.name, box.checked);
          chosen[i] = { selector: link.selector, ...(next && { params: next }) };
          render();
          const same = [...params.querySelectorAll('input')].find((b) => b.dataset.name === o.name);
          same?.focus();
        });
        const value = o.value === undefined ? o.name : `${o.name}=${o.value}`;
        const note = o.note ? el(doc, 'span', { className: 'note' }, o.note) : '';
        params.append(el(doc, 'label', {}, box, el(doc, 'code', {}, value), note));
      }
    };

    const render = (typing = false) => {
      const link = chosen[i] as PostLink;
      const sel = link.selector;
      const j = optionIndex(f.options, sel);
      choice.value = !sel.value.trim() ? AUTO : j >= 0 ? String(j) : CUSTOM;
      type.value = sel.type;
      if (!typing) input.value = sel.value;
      const d = withPostLink(f.descriptor, link);
      const check = checkFeed(doc, d, base);
      renderParams(d, check.items);
      const url = check.items[0]?.permalink;
      const n = check.items.length;
      if (!sel.value.trim())
        opens.textContent = url
          ? `Automatic: opens ${url}`
          : 'Automatic: no link in the first post.';
      else if (!check.linkHits)
        opens.textContent = `This selector finds no link in any of the ${n} posts, so the automatic link is used.`;
      else opens.textContent = `Opens: ${url} (found in ${check.linkHits} of ${n} posts)`;
    };
    choice.addEventListener('change', () => {
      const o = f.options[Number(choice.value)];
      if (choice.value === AUTO) setSelector({ type: 'css', value: '' });
      else if (o) setSelector({ ...o.selector });
      render();
      if (choice.value === CUSTOM) input.focus();
    });
    type.addEventListener('change', () => {
      setSelector({ type: type.value as Selector['type'], value: input.value });
      render();
    });
    input.addEventListener('input', () => {
      setSelector({ type: type.value as Selector['type'], value: input.value });
      render(true);
    });
    const box = el(
      doc,
      'fieldset',
      {},
      choice,
      el(doc, 'div', { className: 'sel' }, type, input),
      opens,
      params,
    );
    if (feeds.length > 1) box.prepend(el(doc, 'legend', {}, `Feed ${i + 1}`));
    panel.append(box);
    render();
  });

  const cancel = el(doc, 'button', { type: 'button', className: 'cancel' }, 'Cancel');
  const next = el(doc, 'button', { type: 'button', className: 'primary next' }, 'Next');
  panel.append(el(doc, 'div', { className: 'row' }, cancel, next));
  doc.documentElement.append(host);

  return new Promise((resolve) => {
    const done = (v: LinkChoice | null) => {
      host.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => done(null));
    next.addEventListener('click', () => {
      const links: LinkChoice = {};
      feeds.forEach((f, i) => {
        const { selector: sel, params } = chosen[i] as PostLink;
        links[f.descriptor.id] = {
          selector: { type: sel.type, value: sel.value.trim() },
          ...(params && { params }),
        };
      });
      done(links);
    });
  });
}
