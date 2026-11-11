import {
  type ItemStructure,
  parseProfile,
  type Selector,
  serializeProfile,
  validateSelector,
} from 'feedgrab';
import { shippedPages } from './builtin';
import { postLinkOf, withPostLink } from './links';
import { pageKey, type Site, type View } from './model';
import { withStructure } from './structure';

/** A page's editable fields: its view, path pattern and each feed's selectors. */
export interface PageDraft {
  view: View;
  pathPattern: string;
  /**
   * `link` (the post link) is relative to the item; empty means automatic. `params` are the link's
   * query parameters that identify a post; unset keeps all but tracking ones. `structure` lists
   * the parts a post has (selectors relative to the item); items without a required one get no
   * button.
   */
  feeds: {
    container: Selector;
    item: Selector;
    link: Selector;
    params?: string[];
    structure?: ItemStructure;
  }[];
}

export const pageDraft = (e: Site['profiles'][number]): PageDraft => ({
  view: e.view,
  pathPattern: e.profile.pathPattern,
  feeds: e.profile.feeds.map((f) => {
    const { selector, params } = postLinkOf(f);
    return {
      container: f.container,
      item: f.item,
      link: selector,
      ...(params && { params }),
      ...(f.structure && { structure: f.structure }),
    };
  }),
});

const same = (a: Selector, b: Selector) => a.type === b.type && a.value === b.value;

function checkSelector(doc: Document, sel: Selector, what: string): Selector {
  const value = sel.value.trim();
  if (!value) throw new Error(`${what} is empty.`);
  const res = validateSelector(doc, { ...sel, value });
  if (!res.valid) throw new Error(`${what} is not a valid ${sel.type.toUpperCase()} selector.`);
  return { ...sel, value };
}

/**
 * Applies a manual edit to page `index` of `site`, or throws an `Error` saying what is wrong.
 * Feeds whose container or item selectors change get a new id, so built-in selector refreshes
 * leave them alone; `renamed` maps old feed ids to new ones.
 */
export function editPage(
  site: Site,
  index: number,
  draft: PageDraft,
  doc = document,
): { site: Site; renamed: Record<string, string> } {
  const entry = site.profiles[index];
  if (!entry) throw new Error('This page no longer exists.');
  const pathPattern = draft.pathPattern.trim();
  if (!pathPattern.startsWith('/')) throw new Error('Path pattern must start with /.');
  const key = `${draft.view}:${pathPattern}`;
  if (site.profiles.some((e, i) => i !== index && pageKey(e) === key))
    throw new Error(`This site already has a page for ${pathPattern} in that view.`);

  const stamp = Date.now().toString(36);
  const renamed: Record<string, string> = {};
  const feeds = entry.profile.feeds.map((f, i) => {
    const d = draft.feeds[i];
    if (!d) return f;
    const n = entry.profile.feeds.length > 1 ? ` (feed ${i + 1})` : '';
    const container = checkSelector(doc, d.container, `Container selector${n}`);
    const item = checkSelector(doc, d.item, `Item selector${n}`);
    const link = d.link.value.trim() ? checkSelector(doc, d.link, `Link selector${n}`) : d.link;
    const parts = (d.structure?.parts ?? []).map((p, j) => ({
      ...p,
      selector: checkSelector(doc, p.selector, `Part ${j + 1} selector${n}`),
    }));
    const linked = withStructure(
      withPostLink(f, { selector: link, ...(d.params && { params: d.params }) }),
      { parts },
    );
    if (same(container, f.container) && same(item, f.item)) return linked;
    const id = `edited-${stamp}-${i}`;
    renamed[f.id] = id;
    return { ...linked, id, container, item, source: 'manual' as const, confirmed: true };
  });
  const profile = parseProfile(
    serializeProfile({ ...entry.profile, pathPattern, feeds, updatedAt: new Date().toISOString() }),
  );
  const shipped = shippedPages(site)[index];
  const builtinKey = shipped ? pageKey(shipped) : entry.builtinKey;
  return {
    site: {
      ...site,
      profiles: site.profiles.with(index, {
        view: draft.view,
        profile,
        ...(builtinKey && { builtinKey }),
      }),
    },
    renamed,
  };
}

/** `editPage` without the id map. */
export const applyPageEdit = (site: Site, index: number, draft: PageDraft, doc = document): Site =>
  editPage(site, index, draft, doc).site;
