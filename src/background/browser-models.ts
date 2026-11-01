import { type Spec, specKey } from '../ai/browser/catalog';
import { type BrowserHost, host } from '../ai/browser/host';
import type { LoadResult } from '../ai/browser/protocol';
import {
  type DownloadProgress,
  downloadedItem,
  downloadsItem,
  MODEL_CACHE,
} from '../store/browser-models';

// Storage writes are read-modify-write; run them one after another.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => {
  const next = chain.then(f, f);
  chain = next.catch(() => {});
  return next;
};

const setProgress = (key: string, p?: DownloadProgress) =>
  serial(async () => {
    const all = { ...(await downloadsItem.getValue()) };
    if (p) all[key] = p;
    else delete all[key];
    await downloadsItem.setValue(all);
  });

/** Downloads a model's files into the cache (with progress) and records it as downloaded. */
export async function downloadModel(spec: Spec, h: BrowserHost = host): Promise<void> {
  const key = specKey(spec);
  await setProgress(key, { loaded: 0, total: 0 });
  let last = 0;
  try {
    const { bytes } = await h.call<LoadResult>(
      { op: 'load', spec, download: true },
      {
        onProgress: (loaded, total) => {
          if (Date.now() - last < 400) return;
          last = Date.now();
          void setProgress(key, { loaded, total });
        },
      },
    );
    await serial(async () =>
      downloadedItem.setValue({
        ...(await downloadedItem.getValue()),
        [key]: { at: Date.now(), bytes },
      }),
    );
    await setProgress(key);
  } catch (e) {
    await setProgress(key, { loaded: 0, total: 0, error: (e as Error).message });
    throw e;
  }
}

/** Unloads a model and deletes its cached files and records (all precisions). */
export async function deleteModel(model: string, h: BrowserHost = host): Promise<void> {
  if (h.open)
    await h.call({ op: 'unload', model }, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(MODEL_CACHE);
    for (const req of await cache.keys())
      if (req.url.includes(`/${model}/resolve/`)) await cache.delete(req);
  }
  const mine = (k: string) => k.startsWith(`${model}@`);
  await serial(async () => {
    const all = await downloadedItem.getValue();
    await downloadedItem.setValue(
      Object.fromEntries(Object.entries(all).filter(([k]) => !mine(k))),
    );
    const dl = await downloadsItem.getValue();
    await downloadsItem.setValue(Object.fromEntries(Object.entries(dl).filter(([k]) => !mine(k))));
  });
}

/** True when the model (in this precision) is on this device. */
export const isDownloaded = async (spec: Pick<Spec, 'model' | 'dtype'>) =>
  !!(await downloadedItem.getValue())[specKey(spec)];
