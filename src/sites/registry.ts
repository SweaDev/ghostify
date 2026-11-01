import { storage } from 'wxt/utils/storage';
import { DEFAULT_SITES } from './defaults';
import type { Site } from './model';

export const sitesItem = storage.defineItem<Site[]>('local:sites', { fallback: DEFAULT_SITES });

export const getSites = () => sitesItem.getValue();

/** Adds built-in sites that are missing from storage; never overwrites user edits. */
export async function ensureDefaultSites(): Promise<void> {
  const stored = await storage.getItem<Site[]>('local:sites');
  const sites = stored ?? [];
  const missing = DEFAULT_SITES.filter((d) => !sites.some((s) => s.id === d.id));
  if (stored === null || missing.length) await sitesItem.setValue([...sites, ...missing]);
}

export async function saveSite(site: Site): Promise<void> {
  const sites = await getSites();
  const i = sites.findIndex((s) => s.id === site.id);
  await sitesItem.setValue(i === -1 ? [...sites, site] : sites.with(i, site));
}

export async function deleteSite(id: string): Promise<void> {
  await sitesItem.setValue((await getSites()).filter((s) => s.id !== id || s.builtin));
}
