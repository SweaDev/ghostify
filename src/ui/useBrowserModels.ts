import { useEffect, useState } from 'react';
import {
  type Downloaded,
  type DownloadProgress,
  downloadedItem,
  downloadsItem,
} from '../store/browser-models';

/** Downloaded in-browser models and running downloads (live), by `model@dtype`. */
export function useBrowserModels() {
  const [downloaded, setDownloaded] = useState<Record<string, Downloaded>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  useEffect(() => {
    void downloadedItem.getValue().then(setDownloaded);
    void downloadsItem.getValue().then(setDownloads);
    const a = downloadedItem.watch((v) => setDownloaded(v ?? {}));
    const b = downloadsItem.watch((v) => setDownloads(v ?? {}));
    return () => {
      a();
      b();
    };
  }, []);
  return { downloaded, downloads };
}
