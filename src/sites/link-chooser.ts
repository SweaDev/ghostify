import {
  type FeedDescriptor,
  type PermalinkCandidate,
  type Selector,
  suggestPermalinks,
} from 'feedgrab';
import { HIGHLIGHT_CSS, highlighter } from './highlight';
import {
  checkFeed,
  linkParams,
  optionIndex,
  optionLabel,
  type PostLink,
  paramOptions,
  toggleIgnored,
  toggleParam,
  withIgnore,
  withPostLink,
} from './links';
import { framePanel, PANEL_CSS } from './panel';
import { poolAround } from './structure';

const CSS = `${PANEL_CSS}
.panel { width: 380px; }
fieldset { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 0 0 8px; min-width: 0; }
legend { font-weight: 600; padding: 0 4px; }
select, input { font: inherit; box-sizing: border-box; border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; background: var(--field); color: inherit; }
.choice { width: 100%; }
.sel { display: flex; gap: 6px; margin-top: 6px; }
.sel input { flex: 1; min-width: 0; font: 12px ui-monospace, monospace; }
.opens { margin: 6px 0 0; font-size: 12px; word-break: break-all; }
.params { margin: 6px 0 0; font-size: 12px; }
.params p { margin: 0 0 2px; }
.params label { display: flex; gap: 6px; align-items: baseline; word-break: break-all; }
.params code { font: 12px ui-monospace, monospace; }
.params .note { color: var(--faint); }
.params label.own { margin-top: 4px; color: var(--muted); }
.sample { display: flex; gap: 6px; align-items: center; margin: 0 0 6px; font-size: 12px; }
.sample button { min-width: 28px; padding: 2px 8px; }
.sample .which { white-space: nowrap; }
.sample .excerpt { color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
${HIGHLIGHT_CSS}`;

export interface LinkFeed {
  descriptor: FeedDescriptor;
  /** The feed's posts on the page, in order; the sample post is one of them. */
  items: Element[];
  /** Index of the pre-selected sample post. */
  reference: number;
  /** Saved post link (empty selector = automatic); unset follows the best suggestion. */
  link?: PostLink;
}

/** Post link (empty selector = automatic) and sample post index per feed id. */
export type LinkChoice = Record<string, { link: PostLink; reference: number }>;

/** The chosen post links, and the query parameters the site ignores in every feed. */
export interface LinksResult {
  links: LinkChoice;
  ignore: string[];
}

/** feedgrab's ranked post links of sample post `reference`. */
export const linkOptions = (items: Element[], reference: number, base: string) => {
  const ref = items[reference];
  return ref ? suggestPermalinks(poolAround(items, reference), base, { reference: ref }) : [];
};

/** The post's text with its pieces kept apart ("Ana · 3h The sunset…"), shortened. */
function excerpt(el?: Element): string {
  if (!el) return '';
  const walker = el.ownerDocument.createTreeWalker(el, 4);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue?.trim();
    if (t) parts.push(t);
  }
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 80);
}

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

/**
 * Asks for each feed's sample post (a typical one, not an ad or a heading), which of its links
 * is the post's URL, and which query parameters identify a post: for the whole site (starting
 * from `ignore`, the site's ignored ones) or for one feed. Resolves null on cancel.
 */
export function chooseLinks(
  doc: Document,
  base: string,
  feeds: LinkFeed[],
  ignore: readonly string[] = [],
): Promise<LinksResult | null> {
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
      'Ghostify saves this link with each post you ghostify and uses it to recognise the post. The choices come from the sample post (outlined on the page): step to a typical post if the first one is an ad or a heading. You can also edit the selector, which is relative to the post, and choose which of the link’s query parameters identify the post.',
    ),
  );
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ghostify: post link');
  const style = el(doc, 'style', {}, CSS);
  root.append(style, panel);
  const unframe = framePanel(panel, 'Step 2 of 4 · Post link');
  const marks = highlighter(doc, root);

  const refs = feeds.map((f) =>
    Math.min(Math.max(0, f.reference), Math.max(0, f.items.length - 1)),
  );
  const options: PermalinkCandidate[][] = feeds.map((f, i) =>
    linkOptions(f.items, refs[i] ?? 0, base),
  );
  const best = (i: number): PostLink => ({
    selector: { ...(options[i]?.[0]?.selector ?? { type: 'css', value: '' }) },
  });
  // Without a saved link, the link follows the best suggestion until the user picks one.
  const following = feeds.map((f) => !f.link);
  const chosen: PostLink[] = feeds.map((f, i) =>
    f.link ? { ...f.link, selector: { ...f.link.selector } } : best(i),
  );
  let ignored = [...ignore];
  const siteName = new URL(base).hostname.replace(/^www\./, '');
  // A site-wide parameter change shows in every feed that follows the site's choice.
  const renders: (() => void)[] = [];
  const mark = () =>
    marks.set(
      feeds.flatMap((f, i) => {
        const el = f.items[refs[i] ?? 0];
        return el ? [{ el, kind: 'sample' as const }] : [];
      }),
    );
  feeds.forEach((f, i) => {
    const choice = el(doc, 'select', { className: 'choice' });
    choice.setAttribute('aria-label', `Post link${feeds.length > 1 ? ` (feed ${i + 1})` : ''}`);
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
      following[i] = false;
    };
    const fillChoices = () => {
      choice.replaceChildren();
      (options[i] ?? []).forEach((o, j) => {
        choice.append(el(doc, 'option', { value: String(j) }, optionLabel(o, base)));
      });
      choice.append(
        el(doc, 'option', { value: CUSTOM }, 'Custom selector'),
        el(doc, 'option', { value: AUTO }, 'Automatic'),
      );
    };

    const prev = el(doc, 'button', { type: 'button', className: 'prev-post' }, '‹');
    const nextPost = el(doc, 'button', { type: 'button', className: 'next-post' }, '›');
    prev.setAttribute('aria-label', 'Previous sample post');
    nextPost.setAttribute('aria-label', 'Next sample post');
    const which = el(doc, 'span', { className: 'which' });
    const quote = el(doc, 'span', { className: 'excerpt' });
    const sample = el(
      doc,
      'div',
      { className: 'sample' },
      el(doc, 'span', {}, 'Sample post'),
      prev,
      which,
      nextPost,
      quote,
    );
    const showSample = () => {
      const r = refs[i] ?? 0;
      which.textContent = `${r + 1} of ${f.items.length}`;
      quote.textContent = excerpt(f.items[r]);
      prev.disabled = r <= 0;
      nextPost.disabled = r >= f.items.length - 1;
    };
    const step = (by: number) => {
      const r = Math.min(Math.max(0, (refs[i] ?? 0) + by), f.items.length - 1);
      refs[i] = r;
      options[i] = linkOptions(f.items, r, base);
      if (following[i]) chosen[i] = best(i);
      fillChoices();
      showSample();
      mark();
      f.items[r]?.scrollIntoView?.({ block: 'center' });
      render();
    };
    prev.addEventListener('click', () => step(-1));
    nextPost.addEventListener('click', () => step(1));

    const renderParams = (d: FeedDescriptor, items: ReturnType<typeof checkFeed>['items']) => {
      const link = chosen[i] as PostLink;
      const own = !!link.params;
      const options = paramOptions(linkParams(items, d, base), link.params, ignored);
      params.replaceChildren();
      if (!options.length) return;
      const refocus = (name: string) =>
        [...params.querySelectorAll('input')].find((b) => b.dataset.name === name)?.focus();
      params.append(
        el(
          doc,
          'p',
          {},
          own
            ? 'Query parameters that identify a post in this feed:'
            : `Query parameters that identify a post on ${siteName} (untick tracking ones; this applies to every feed of the site):`,
        ),
      );
      for (const o of options) {
        const box = el(doc, 'input', { type: 'checkbox', checked: o.kept });
        box.setAttribute('aria-label', `Keep ${o.name}`);
        box.dataset.name = o.name;
        box.addEventListener('change', () => {
          if (own)
            chosen[i] = {
              selector: link.selector,
              params: toggleParam(options, o.name, box.checked),
            };
          else ignored = toggleIgnored(ignored, o.name, box.checked);
          for (const r of own ? [render] : renders) r();
          refocus(o.name);
        });
        const value = o.value === undefined ? o.name : `${o.name}=${o.value}`;
        const note = o.note ? el(doc, 'span', { className: 'note' }, o.note) : '';
        params.append(el(doc, 'label', {}, box, el(doc, 'code', {}, value), note));
      }
      const scope = el(doc, 'input', { type: 'checkbox', checked: own });
      scope.dataset.name = ':own';
      scope.addEventListener('change', () => {
        chosen[i] = scope.checked
          ? { selector: link.selector, params: options.filter((o) => o.kept).map((o) => o.name) }
          : { selector: link.selector };
        render();
        refocus(':own');
      });
      params.append(
        el(
          doc,
          'label',
          { className: 'own' },
          scope,
          el(doc, 'span', {}, 'Only this feed (its own choice, not the site’s)'),
        ),
      );
    };

    const render = (typing = false) => {
      const link = chosen[i] as PostLink;
      const sel = link.selector;
      const j = optionIndex(options[i] ?? [], sel);
      choice.value = !sel.value.trim() ? AUTO : j >= 0 ? String(j) : CUSTOM;
      type.value = sel.type;
      if (!typing) input.value = sel.value;
      const d = withPostLink(f.descriptor, link);
      const check = checkFeed(doc, withIgnore(d, ignored), base);
      renderParams(d, check.items);
      const ref = f.items[refs[i] ?? 0];
      const url = check.items.find((it) => it.element === ref)?.permalink;
      const n = check.items.length;
      if (!sel.value.trim())
        opens.textContent = url
          ? `Automatic: opens ${url}`
          : 'Automatic: no link in the sample post.';
      else if (!check.linkHits)
        opens.textContent = `This selector finds no link in any of the ${n} posts, so the automatic link is used.`;
      else
        opens.textContent = url
          ? `Opens: ${url} (found in ${check.linkHits} of ${n} posts)`
          : `No link in the sample post (found in ${check.linkHits} of ${n} posts).`;
    };
    renders.push(() => render());
    choice.addEventListener('change', () => {
      const o = options[i]?.[Number(choice.value)];
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
      sample,
      choice,
      el(doc, 'div', { className: 'sel' }, type, input),
      opens,
      params,
    );
    if (feeds.length > 1) box.prepend(el(doc, 'legend', {}, `Feed ${i + 1}`));
    panel.append(box);
    fillChoices();
    showSample();
    render();
  });
  mark();

  const cancel = el(doc, 'button', { type: 'button', className: 'cancel' }, 'Cancel');
  const next = el(doc, 'button', { type: 'button', className: 'primary next' }, 'Next');
  panel.append(el(doc, 'div', { className: 'row' }, cancel, next));
  doc.documentElement.append(host);

  return new Promise((resolve) => {
    const done = (v: LinksResult | null) => {
      unframe();
      marks.destroy();
      host.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => done(null));
    next.addEventListener('click', () => {
      const links: LinkChoice = {};
      feeds.forEach((f, i) => {
        const { selector: sel, params } = chosen[i] as PostLink;
        links[f.descriptor.id] = {
          link: {
            selector: { type: sel.type, value: sel.value.trim() },
            ...(params && { params }),
          },
          reference: refs[i] ?? 0,
        };
      });
      done({ links, ignore: ignored });
    });
  });
}
