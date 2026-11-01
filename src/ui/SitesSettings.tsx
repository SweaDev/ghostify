import { ChevronDown, Download, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mergeSites, parseSitesJson, serializeSites } from '../sites/io';
import type { LoginIndicator, Site, View } from '../sites/model';
import { deleteSite, getSites, saveSite, sitesItem } from '../sites/registry';
import { IconButton } from './ItemCard';
import { Switch } from './Switch';

const VIEW_LABEL: Record<View, string> = {
  any: 'Any view',
  loggedIn: 'Logged in',
  loggedOut: 'Logged out',
};

export function useSites(): Site[] | undefined {
  const [sites, setSites] = useState<Site[]>();
  useEffect(() => {
    void getSites().then(setSites);
    return sitesItem.watch((v) => setSites(v));
  }, []);
  return sites;
}

const input =
  'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

function IndicatorEditor({ site }: { site: Site }) {
  const [sel, setSel] = useState(site.loginIndicator?.selector ?? '');
  const [when, setWhen] = useState<LoginIndicator['whenPresent']>(
    site.loginIndicator?.whenPresent ?? 'loggedIn',
  );
  const save = () =>
    void saveSite({
      ...site,
      loginIndicator: sel.trim() ? { selector: sel.trim(), whenPresent: when } : undefined,
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-500">Login indicator</span>
      <input
        aria-label="Login indicator selector"
        placeholder="CSS selector, e.g. #user-menu"
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        onBlur={save}
        className={`${input} min-w-56 flex-1 font-mono text-xs`}
      />
      <span className="text-zinc-500">when present means</span>
      <select
        aria-label="Indicator meaning"
        value={when}
        onChange={(e) => setWhen(e.target.value as LoginIndicator['whenPresent'])}
        onBlur={save}
        className={input}
      >
        <option value="loggedIn">logged in</option>
        <option value="loggedOut">logged out</option>
      </select>
    </div>
  );
}

function SiteCard({ site }: { site: Site }) {
  const [open, setOpen] = useState(false);
  const removeProfile = (i: number) =>
    void saveSite({ ...site, profiles: site.profiles.filter((_, j) => j !== i) });
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center gap-3 p-4">
        <Switch
          checked={site.enabled}
          label={`Enable ${site.label}`}
          onChange={(enabled) => void saveSite({ ...site, enabled })}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="font-medium">{site.label}</span>
          <span className="ml-2 text-sm text-zinc-500">{site.hostname}</span>
          {site.builtin && (
            <span className="ml-2 rounded-full bg-ghost-50 px-2 py-0.5 text-ghost-700 text-xs dark:bg-ghost-900/50 dark:text-ghost-200">
              built-in
            </span>
          )}
        </button>
        <span className="text-xs text-zinc-500">
          {site.profiles.length} page{site.profiles.length === 1 ? '' : 's'}
        </span>
        {!site.builtin && (
          <IconButton label={`Delete ${site.label}`} onClick={() => void deleteSite(site.id)}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
        <ChevronDown className={`size-4 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-zinc-100 border-t p-4 dark:border-zinc-800">
          <IndicatorEditor site={site} />
          <ul className="flex flex-col gap-2">
            {site.profiles.map((e, i) => (
              <li
                key={`${e.view}:${e.profile.pathPattern}`}
                className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <code className="font-semibold">{e.profile.pathPattern}</code>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">
                    {VIEW_LABEL[e.view]}
                  </span>
                  <span className="ml-auto" />
                  <IconButton
                    label={`Remove ${e.profile.pathPattern}`}
                    onClick={() => removeProfile(i)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {e.profile.feeds.map((f) => (
                    <li key={f.id}>
                      {f.container.value} → {f.item.value}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function SitesSettings() {
  const sites = useSites();
  const [error, setError] = useState<string>();
  const file = useRef<HTMLInputElement>(null);

  const exportSites = () => {
    if (!sites) return;
    const url = URL.createObjectURL(
      new Blob([serializeSites(sites)], { type: 'application/json' }),
    );
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: 'ghostify-sites.json',
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  const importSites = async (f: File) => {
    try {
      const incoming = parseSitesJson(await f.text());
      await sitesItem.setValue(mergeSites(await getSites(), incoming));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-zinc-500">
          Ghostify works on these sites. Add a site from the toolbar popup while you are on it.
        </p>
        <button
          type="button"
          onClick={exportSites}
          className={`${input} inline-flex items-center gap-1.5`}
        >
          <Download className="size-4" /> Export
        </button>
        <button
          type="button"
          onClick={() => file.current?.click()}
          className={`${input} inline-flex items-center gap-1.5`}
        >
          <Upload className="size-4" /> Import
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          aria-label="Import sites file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importSites(f);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 p-2 text-red-700 text-sm dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {sites?.map((s) => (
          <SiteCard key={s.id} site={s} />
        ))}
      </ul>
    </section>
  );
}
