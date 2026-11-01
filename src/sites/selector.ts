/** Escapes a value for use inside a double-quoted attribute selector. */
const quoted = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;
const STABLE_CLASS = /^[a-z][a-z-_]*[a-z]$/i;
const unique = (doc: Document, sel: string) => {
  try {
    return doc.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
};

/** A short CSS selector that matches only `el`, preferring ids, test ids and readable classes. */
export function selectorFor(el: Element): string {
  const doc = el.ownerDocument;
  const tag = el.localName;
  const candidates: string[] = [];
  if (el.id) candidates.push(`#${CSS.escape(el.id)}`);
  for (const a of ['data-testid', 'data-test', 'aria-label', 'name']) {
    const v = el.getAttribute(a);
    if (v) candidates.push(`${tag}[${a}=${quoted(v)}]`);
  }
  const classes = [...el.classList]
    .filter((c) => STABLE_CLASS.test(c))
    .map((c) => `.${CSS.escape(c)}`);
  for (let n = 1; n <= classes.length; n++) candidates.push(tag + classes.slice(0, n).join(''));
  const href = el.getAttribute('href');
  if (href && !href.startsWith('javascript:')) candidates.push(`${tag}[href=${quoted(href)}]`);
  const hit = candidates.find((c) => unique(doc, c));
  if (hit) return hit;
  const parent = el.parentElement;
  if (!parent || parent === doc.documentElement) return tag;
  const nth = [...parent.children].filter((c) => c.localName === tag).indexOf(el) + 1;
  return `${selectorFor(parent)} > ${tag}:nth-of-type(${nth})`;
}
