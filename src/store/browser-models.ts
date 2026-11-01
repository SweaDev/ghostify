import { storage } from 'wxt/utils/storage';

export interface Downloaded {
  at: number;
  /** Bytes fetched (0 when the files were already cached). */
  bytes: number;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  error?: string;
}

/** In-browser models on this device, by `model@dtype` (the files live in Cache Storage). */
export const downloadedItem = storage.defineItem<Record<string, Downloaded>>(
  'local:browserModels',
  { fallback: {} },
);

/** Running or failed downloads, by `model@dtype` (session storage: extension pages only). */
export const downloadsItem = storage.defineItem<Record<string, DownloadProgress>>(
  'session:browserDownloads',
  { fallback: {} },
);

/** Transformers.js's Cache Storage name. */
export const MODEL_CACHE = 'transformers-cache';
