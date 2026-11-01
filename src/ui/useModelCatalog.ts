import { useEffect, useState } from 'react';
import { listModels, type ModelInfo, needsKey } from '../ai/catalog';
import type { Keys, Provider } from '../store/settings';

export type CatalogEntry = { models: ModelInfo[] } | { error: string };

/** Fetches the model list of each provider in use; refetches when its key or the Ollama URL changes. */
export function useModelCatalog(providers: Provider[], keys: Keys, ollamaBaseUrl: string) {
  const [catalog, setCatalog] = useState<Partial<Record<string, CatalogEntry>>>({});
  const wanted = providers
    .filter((p) => !needsKey(p) || keys[p as keyof Keys])
    .map((p) => `${p}|${p === 'ollama' ? ollamaBaseUrl : (keys[p as keyof Keys] ?? '')}`);
  const sig = [...new Set(wanted)].sort().join('\n');

  useEffect(() => {
    for (const id of sig ? sig.split('\n') : []) {
      const [p, v] = id.split('|') as [Provider, string];
      listModels(p, { key: p === 'ollama' ? undefined : v, ollamaBaseUrl })
        .then((models) => ({ models }))
        .catch((e: Error) => ({ error: e.message }))
        .then((entry) => setCatalog((c) => ({ ...c, [id]: entry })));
    }
  }, [sig, ollamaBaseUrl]);

  return (p: Provider): CatalogEntry | undefined =>
    catalog[`${p}|${p === 'ollama' ? ollamaBaseUrl : (keys[p as keyof Keys] ?? '')}`];
}
