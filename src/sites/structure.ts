import {
  type FeedDescriptor,
  type FeedItem,
  findReferenceItem,
  type ItemStructure,
  matchSelector,
  matchStructure,
  type StructurePart,
  suggestStructure,
} from 'feedgrab';

/** Items feedgrab compares a suggested structure against (around the sample post). */
const POOL = 30;

/** The descriptor with `structure` (removed when unset or without parts). */
export function withStructure(f: FeedDescriptor, structure?: ItemStructure): FeedDescriptor {
  const { structure: _, ...rest } = f;
  return structure?.parts.length ? { ...rest, structure } : rest;
}

const partsKey = (s?: ItemStructure) =>
  JSON.stringify((s?.parts ?? []).map((p) => [p.selector.type, p.selector.value, p.required]));

/** Whether two structures have the same parts (labels aside). */
export const sameStructure = (a?: ItemStructure, b?: ItemStructure) => partsKey(a) === partsKey(b);

/** Whether a structure rules items out (has a required part). */
export const hasRequired = (s?: ItemStructure) => !!s?.parts.some((p) => p.required);

/** Whether feedgrab excluded the item for lacking a required part of its feed's structure. */
export const offStructure = (item: FeedItem) => item.reasons.some((r) => r.kind === 'structure');

/** Index of the default sample post: the first one most like the saved structure, else 0. */
export function defaultReference(items: Element[], structure?: ItemStructure): number {
  return Math.max(0, structure ? findReferenceItem(items, structure) : 0);
}

/** The first `POOL` items plus the sample post, for feedgrab's suggestions. */
export function poolAround(items: Element[], reference: number): Element[] {
  const ref = items[reference];
  const pool = items.slice(0, POOL);
  return ref && !pool.includes(ref) ? [...pool, ref] : pool;
}

/**
 * Parts to start from for sample post `reference`: the saved ones when it is the post the saved
 * structure points to, else feedgrab's suggestions for it.
 */
export function startingParts(
  items: Element[],
  reference: number,
  saved?: ItemStructure,
): StructurePart[] {
  if (saved?.parts.length && reference === defaultReference(items, saved)) return saved.parts;
  return suggestParts(items, reference);
}

/** feedgrab's suggested parts for sample post `reference` (without display-only fields). */
export function suggestParts(items: Element[], reference: number): StructurePart[] {
  const ref = items[reference];
  if (!ref) return [];
  return suggestStructure(poolAround(items, reference), { reference: ref }).map((p) => ({
    selector: p.selector,
    required: p.required,
    ...(p.label && { label: p.label }),
  }));
}

/** How many of `items` have every required part (all of them without a structure). */
export function countMatching(items: Element[], structure?: ItemStructure): number {
  if (!hasRequired(structure)) return items.length;
  return items.filter((el) => matchStructure(el, structure as ItemStructure).ok).length;
}

/** How many of `items` have `part`. */
export const partCoverage = (items: Element[], part: StructurePart) =>
  countMatching(items, { parts: [{ ...part, required: true }] });

/** The part's first element in `item`, or null (also for an invalid selector). */
export function partElement(item: Element, part: StructurePart): Element | null {
  try {
    return matchSelector(item.ownerDocument, part.selector, { root: item }).elements[0] ?? null;
  } catch {
    return null;
  }
}

/** Short text of the part in `item`: its text, `alt` or `aria-label`. */
export function partText(item: Element, part: StructurePart): string {
  const el = partElement(item, part);
  if (!el) return '';
  const text =
    el.textContent?.replace(/\s+/g, ' ').trim() ||
    el.getAttribute('alt') ||
    el.getAttribute('aria-label') ||
    '';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
