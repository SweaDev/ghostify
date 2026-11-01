import { Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '../messaging';
import type { Site } from '../sites/model';
import { findSite } from '../sites/picker';
import { siteOrigins } from '../sites/registration';
import { useSites } from './SitesSettings';

interface ActiveTab {
  id: number;
  host: string;
}

/** The active tab's site status, with "Add this site" / "Edit selectors". */
export function CurrentSite() {
  const [tab, setTab] = useState<ActiveTab>();
  const sites = useSites();
  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      const url = t?.url ? new URL(t.url) : undefined;
      if (t?.id !== undefined && url && /^https?:$/.test(url.protocol))
        setTab({ id: t.id, host: url.hostname });
    });
  }, []);
  if (!tab || !sites) return null;
  const site: Site | undefined = findSite(sites, tab.host);

  const pick = () => {
    // permissions.request must run directly in the click handler (user gesture).
    const origins = siteOrigins(site ?? ({ hostname: tab.host.replace(/^www\./, '') } as Site));
    const request = site?.builtin
      ? Promise.resolve(true)
      : browser.permissions.request({ origins });
    void request.then(async (ok) => {
      if (!ok) return;
      await sendMessage('addSite', { tabId: tab.id });
      window.close();
    });
  };

  return (
    <div className="flex items-center gap-2 border-zinc-100 border-b px-4 py-2 text-sm dark:border-zinc-800">
      <span
        className={`size-2 rounded-full ${site?.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
      />
      <span className="min-w-0 flex-1 truncate">
        {tab.host}
        <span className="ml-1.5 text-xs text-zinc-500">
          {site ? (site.enabled ? 'active' : 'paused') : 'not added'}
        </span>
      </span>
      <button
        type="button"
        onClick={pick}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-ghost-600 text-xs hover:bg-ghost-50 dark:text-ghost-300 dark:hover:bg-ghost-900/40"
      >
        {site ? <SlidersHorizontal className="size-3.5" /> : <Plus className="size-3.5" />}
        {site ? 'Edit selectors' : 'Add this site'}
      </button>
    </div>
  );
}
