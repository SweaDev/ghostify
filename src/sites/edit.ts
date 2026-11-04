import { parseProfile, type Selector, serializeProfile, validateSelector } from 'feedgrab';
import { shippedPages } from './builtin';
import { pageKey, type Site, type View } from './model';

/** A page's editable fields: its view, path pattern and each feed's selectors. */
export interface PageDraft {
  view: View;
  pathPattern: string;
  feeds: { container: Selector; item: Selector }[];
}

export const pageDraft = (e: Site['profiles'][number]): PageDraft => ({
  view: e.view,
  pathPattern: e.profile.pathPattern,
  feeds: e.profile.feeds.map((f) => ({ container: f.container, item: f.item })),
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
 * Feeds whose selectors change get a new id, so built-in selector refreshes leave them alone.
 */
export function applyPageEdit(site: Site, index: number, draft: PageDraft, doc = document): Site {
  const entry = site.profiles[index];
  if (!entry) throw new Error('This page no longer exists.');
  const pathPattern = draft.pathPattern.trim();
  if (!pathPattern.startsWith('/')) throw new Error('Path pattern must start with /.');
  const key = `${draft.view}:${pathPattern}`;
  if (site.profiles.some((e, i) => i !== index && pageKey(e) === key))
    throw new Error(`This site already has a page for ${pathPattern} in that view.`);

  const stamp = Date.now().toString(36);
  const feeds = entry.profile.feeds.map((f, i) => {
    const d = draft.feeds[i];
    if (!d) return f;
    const n = entry.profile.feeds.length > 1 ? ` (feed ${i + 1})` : '';
    const container = checkSelector(doc, d.container, `Container selector${n}`);
    const item = checkSelector(doc, d.item, `Item selector${n}`);
    if (same(container, f.container) && same(item, f.item)) return f;
    return {
      ...f,
      id: `edited-${stamp}-${i}`,
      container,
      item,
      source: 'manual' as const,
      confirmed: true,
    };
  });
  const profile = parseProfile(
    serializeProfile({ ...entry.profile, pathPattern, feeds, updatedAt: new Date().toISOString() }),
  );
  const shipped = shippedPages(site)[index];
  const builtinKey = shipped ? pageKey(shipped) : entry.builtinKey;
  return {
    ...site,
    profiles: site.profiles.with(index, {
      view: draft.view,
      profile,
      ...(builtinKey && { builtinKey }),
    }),
  };
}
