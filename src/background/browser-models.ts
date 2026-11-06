import { DEVICE_LABEL, type Spec, specKey } from '../ai/browser/catalog';
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

/** ONNX Runtime has no kernel for one of the model's operations on this device. */
const MISSING_OP = /could not find an implementation for|failed to find kernel for/i;

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
    let error = (e as Error).message;
    if (MISSING_OP.test(error)) {
      error = `This model can't run on the ${DEVICE_LABEL[spec.device]} here (unsupported operation). Pick another model or switch where models run.`;
      // Its files are useless on this device; drop them unless another precision is in use.
      const others = Object.keys(await downloadedItem.getValue());
      if (!others.some((k) => k.startsWith(`${spec.model}@`)))
        await deleteModel(spec.model, h).catch(() => {});
    }
    await setProgress(key, { loaded: 0, total: 0, error });
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
