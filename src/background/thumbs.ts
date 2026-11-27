import { browser } from 'wxt/browser';
import { db } from '../store/db';

/** Thumbnails fit in this box (CSS px × 2 for sharp cards). */
export const THUMB_BOX = 320;
/** Largest stored thumbnail. */
export const MAX_THUMB_BYTES = 64 * 1024;
/** Largest image Ghostify downloads to make a thumbnail. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export interface Encoded {
  data: ArrayBuffer;
  type: string;
  width: number;
  height: number;
}

export interface ThumbDeps {
  fetch(url: string): Promise<Response>;
  /** Whether Ghostify may fetch from the URL's origin. */
  canFetch(url: string): Promise<boolean>;
  /** Scales an image into the box and encodes it within `MAX_THUMB_BYTES`, or null. */
  encode(image: Blob): Promise<Encoded | null>;
}

const originPattern = (url: string) => `${new URL(url).origin}/*`;

/** Scales into `THUMB_BOX` and tries webp, then smaller qualities and jpeg, until it fits. */
export async function encodeThumb(image: Blob): Promise<Encoded | null> {
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, THUMB_BOX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const [type, quality] of [
      ['image/webp', 0.8],
      ['image/webp', 0.6],
      ['image/jpeg', 0.6],
    ] as const) {
      const blob = await canvas.convertToBlob({ type, quality });
      if (blob.size <= MAX_THUMB_BYTES)
        return { data: await blob.arrayBuffer(), type: blob.type || type, width, height };
    }
    return null;
  } finally {
    bitmap.close();
  }
}

const defaultDeps: ThumbDeps = {
  fetch: (url) => fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }),
  canFetch: (url) =>
    browser.permissions.contains({ origins: [originPattern(url)] }).catch(() => false),
  encode: encodeThumb,
};

/**
 * Makes the item's thumbnail from its image (or poster) when Ghostify may fetch from that host.
 * Returns true when the item has a thumbnail afterwards. Never throws.
 */
export async function makeThumb(key: string, deps: ThumbDeps = defaultDeps): Promise<boolean> {
  try {
    const item = await db.items.get(key);
    const src = item?.image;
    if (!src) return false;
    const existing = await db.thumbs.get(key);
    if (existing?.src === src) return true;
    if (!(await deps.canFetch(src))) return false;
    const res = await deps.fetch(src);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return false;
    if (Number(res.headers.get('content-length')) > MAX_SOURCE_BYTES) return false;
    const blob = await res.blob();
    if (blob.size > MAX_SOURCE_BYTES) return false;
    const encoded = await deps.encode(blob);
    if (!encoded) return false;
    if (!(await db.items.get(key))) return false;
    await db.thumbs.put({ key, ...encoded, src, at: Date.now() });
    return true;
  } catch (e) {
    console.warn('[ghostify:thumbs]', key, e);
    return false;
  }
}

/** Makes missing thumbnails for a site's items (or every item), one at a time; returns how many. */
export async function backfillThumbs(
  siteId?: string,
  deps: ThumbDeps = defaultDeps,
): Promise<number> {
  const items = await (siteId ? db.items.filter((i) => i.siteId === siteId) : db.items).toArray();
  let made = 0;
  for (const item of items) {
    if (!item.image) continue;
    const t = await db.thumbs.get(item.key);
    if (t?.src === item.image) continue;
    if (await makeThumb(item.key, deps)) made++;
  }
  return made;
}

/** Origins (`https://host/*`) of a site's item images, sorted, for one permission request. */
export async function imageOrigins(siteId: string): Promise<string[]> {
  const items = await db.items.filter((i) => i.siteId === siteId && !!i.image).toArray();
  const origins = new Set<string>();
  for (const i of items) {
    try {
      origins.add(originPattern(i.image as string));
    } catch {}
  }
  return [...origins].sort();
}
