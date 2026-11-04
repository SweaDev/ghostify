import { ChevronRight, Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mergeSites, parseSitesJson, serializeSites } from '../sites/io';
import type { LoginIndicator, Site, View } from '../sites/model';
import { deleteSite, getSites, saveSite, sitesItem } from '../sites/registry';
import { IconButton } from './ItemCard';
import { btnDanger, card } from './kit';
import { Switch } from './Switch';
import { useSettings } from './useSettings';

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

function RulesEditor({ site }: { site: Site }) {
  const [draft, setDraft] = useState('');
  const [settings] = useSettings();
  const nli = settings?.ai.decision.provider === 'browser';
  const save = (rules: Site['rules']) => void saveSite({ ...site, rules });
  const add = () => {
    const criteria = draft.trim();
    if (!criteria) return;
    save([...site.rules, { id: `r_${Date.now().toString(36)}`, criteria, enabled: true }]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <span className="font-medium">Auto-ghostify rules</span>
        <span className="ml-2 text-xs text-zinc-500">
          Plain language, checked by the decision model when AI is on.
        </span>
        {nli && (
          <p className="mt-0.5 text-xs text-zinc-500">
            In-browser rule checks work best with short topics, like “crypto hype” or “an
            advertisement”.
          </p>
        )}
      </div>
      {site.rules.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <Switch
            checked={r.enabled}
            label={`Enable rule ${r.criteria}`}
            onChange={(enabled) =>
              save(site.rules.map((x) => (x.id === r.id ? { ...x, enabled } : x)))
            }
          />
          <span className="flex-1">{r.criteria}</span>
          <IconButton
            label={`Delete rule ${r.criteria}`}
            onClick={() => save(site.rules.filter((x) => x.id !== r.id))}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New rule"
          placeholder="e.g. posts that are mostly self-promotion"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${input} flex-1`}
        />
        <button type="submit" className={`${input} inline-flex items-center gap-1`}>
          <Plus className="size-4" /> Add rule
        </button>
      </form>
    </div>
  );
}

const siteHref = (id: string) => `#sites/${encodeURIComponent(id)}`;

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex min-w-0 items-center gap-1 text-zinc-500">
        <li>
          <a href="#sites" className="rounded hover:text-ghost-600 dark:hover:text-ghost-300">
            Sites
          </a>
        </li>
        <ChevronRight className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
        <li aria-current="page" className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {current}
        </li>
      </ol>
    </nav>
  );
}

function SiteDetail({ id, sites }: { id: string; sites: Site[] }) {
  const site = sites.find((s) => s.id === id);
  if (!site)
    return (
      <section>
        <Breadcrumb current="Not found" />
        <p className="text-sm text-zinc-500">
          This site doesn’t exist anymore.{' '}
          <a href="#sites" className="text-ghost-600 underline">
            Back to all sites
          </a>
        </p>
      </section>
    );
  const removeProfile = (i: number) =>
    void saveSite({ ...site, profiles: site.profiles.filter((_, j) => j !== i) });
  return (
    <section className="flex flex-col gap-4">
      <div>
        <Breadcrumb current={site.label} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-semibold text-lg">
              {site.label}
              {site.builtin && <BuiltIn />}
            </h2>
            <p className="text-sm text-zinc-500">{site.hostname}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {site.enabled ? 'Enabled' : 'Disabled'}
            <Switch
              checked={site.enabled}
              label={`Enable ${site.label}`}
              onChange={(enabled) => void saveSite({ ...site, enabled })}
            />
          </div>
          {!site.builtin && (
            <button
              type="button"
              className={btnDanger}
              onClick={() => {
                if (!confirm(`Delete ${site.label}? Its selectors and rules are removed.`)) return;
                void deleteSite(site.id);
                location.replace('#sites');
              }}
            >
              <Trash2 className="size-4" /> Delete site
            </button>
          )}
        </div>
      </div>
      <div className={card}>
        <IndicatorEditor key={site.id} site={site} />
      </div>
      <div className={card}>
        <RulesEditor site={site} />
      </div>
      <div className={`${card} flex flex-col gap-2`}>
        <h3 className="font-medium text-sm">
          Pages <span className="font-normal text-zinc-500">({site.profiles.length})</span>
        </h3>
        {site.profiles.length === 0 && (
          <p className="text-sm text-zinc-500">
            No pages yet. Add one from the toolbar popup while you are on the site.
          </p>
        )}
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
    </section>
  );
}

const BuiltIn = () => (
  <span className="rounded-full bg-ghost-50 px-2 py-0.5 font-normal text-ghost-700 text-xs dark:bg-ghost-900/50 dark:text-ghost-200">
    built-in
  </span>
);

function SiteRow({ site }: { site: Site }) {
  const pages = site.profiles.length;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Switch
        checked={site.enabled}
        label={`Enable ${site.label}`}
        onChange={(enabled) => void saveSite({ ...site, enabled })}
      />
      <a
        href={siteHref(site.id)}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ghost-500"
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium group-hover:text-ghost-600 dark:group-hover:text-ghost-300">
            {site.label}
          </span>
          <span className="ml-2 text-sm text-zinc-500">{site.hostname}</span>
          {site.builtin && (
            <span className="ml-2">
              <BuiltIn />
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">
          {pages} page{pages === 1 ? '' : 's'}
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400 group-hover:text-ghost-500" />
      </a>
    </li>
  );
}

function SiteList({ sites }: { sites: Site[] }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const file = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const shown = q
    ? sites.filter((s) => `${s.label} ${s.hostname}`.toLowerCase().includes(q))
    : sites;

  const exportSites = () => {
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
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          aria-label="Search sites"
          placeholder={`Search ${sites.length} site${sites.length === 1 ? '' : 's'}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm outline-none transition focus:border-ghost-400 focus:ring-2 focus:ring-ghost-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-ghost-900"
        />
      </label>
      {shown.length > 0 ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60">
          {shown.map((s) => (
            <SiteRow key={s.id} site={s} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-zinc-500">
          {q ? `No sites match “${query.trim()}”.` : 'No sites yet.'}
        </p>
      )}
    </section>
  );
}

/** Sites settings: a searchable list at `#sites`, one page per site at `#sites/<id>`. */
export function SitesSettings({ sub }: { sub?: string }) {
  const sites = useSites();
  if (!sites) return null;
  return sub ? <SiteDetail id={sub} sites={sites} /> : <SiteList sites={sites} />;
}
