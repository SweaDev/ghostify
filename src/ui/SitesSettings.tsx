import type { Selector } from 'feedgrab';
import {
  ChevronRight,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  builtinStatus,
  isPageCustomized,
  restorePage,
  restoreSite,
  shippedPages,
} from '../sites/builtin';
import { applyPageEdit, type PageDraft, pageDraft } from '../sites/edit';
import { mergeSites, parseSitesJson, serializeSites } from '../sites/io';
import { type LinkOption, optionIndex, optionLabel } from '../sites/links';
import {
  type LoginIndicator,
  pageKey,
  type Site,
  type SiteProfileEntry,
  type View,
} from '../sites/model';
import { deleteSite, getSites, saveSite, sitesItem } from '../sites/registry';
import { IconButton } from './ItemCard';
import { btn, btnDanger, btnPrimary, card, field } from './kit';
import { Switch } from './Switch';
import { useDialogFocus } from './useDialogFocus';
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

function SelectorField(props: {
  label: string;
  value: Selector;
  placeholder?: string;
  onChange(s: Selector): void;
}) {
  const { label, value, placeholder, onChange } = props;
  return (
    <div className="flex gap-2">
      <select
        aria-label={`${label} type`}
        value={value.type}
        onChange={(e) => onChange({ ...value, type: e.target.value as Selector['type'] })}
        className={field}
      >
        <option value="css">CSS</option>
        <option value="xpath">XPath</option>
      </select>
      <input
        aria-label={label}
        value={value.value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        className={`${field} min-w-0 flex-1 font-mono text-xs`}
      />
    </div>
  );
}

function LinkField(props: {
  label: string;
  value: Selector;
  options: LinkOption[];
  base: string;
  onChange(s: Selector): void;
}) {
  const { label, value, options, base, onChange } = props;
  const j = optionIndex(options, value);
  const choice = !value.value.trim() ? 'auto' : j >= 0 ? String(j) : 'custom';
  return (
    <>
      {options.length > 0 && (
        <select
          aria-label={`${label} choice`}
          value={choice}
          onChange={(e) => {
            const v = e.target.value;
            const o = options[Number(v)];
            if (v === 'auto') onChange({ type: 'css', value: '' });
            else if (o) onChange({ ...o.selector });
          }}
          className={`${field} min-w-0 text-xs`}
        >
          {options.map((o, i) => (
            <option key={o.url} value={i}>
              {optionLabel(o, base)}
            </option>
          ))}
          <option value="custom">Custom selector</option>
          <option value="auto">Automatic (heading link, else the deepest link)</option>
        </select>
      )}
      <SelectorField label={label} value={value} onChange={onChange} placeholder="Automatic" />
    </>
  );
}

function PageForm(props: { site: Site; index: number; entry: SiteProfileEntry; onDone(): void }) {
  const { site, index, entry, onDone } = props;
  const [draft, setDraft] = useState<PageDraft>(() => pageDraft(entry));
  const [error, setError] = useState<string>();
  const many = entry.profile.feeds.length > 1;
  const setFeed = (i: number, part: 'container' | 'item' | 'link', sel: Selector) =>
    setDraft((d) => ({
      ...d,
      feeds: d.feeds.map((f, j) => (j === i ? { ...f, [part]: sel } : f)),
    }));
  const save = async () => {
    try {
      await saveSite(applyPageEdit(site, index, draft));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form
      aria-label={`Edit ${entry.profile.pathPattern}`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-500">
          Path pattern
          <input
            value={draft.pathPattern}
            placeholder="/ or /top/*"
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, pathPattern: e.target.value })}
            className={`${field} font-mono text-xs text-zinc-900 dark:text-zinc-100`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          View
          <select
            value={draft.view}
            onChange={(e) => setDraft({ ...draft, view: e.target.value as View })}
            className={`${field} text-zinc-900 dark:text-zinc-100`}
          >
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <option key={v} value={v}>
                {VIEW_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {entry.profile.feeds.map((f, i) => {
        const d = draft.feeds[i];
        if (!d) return null;
        const name = (part: string) =>
          many
            ? `Feed ${i + 1} ${part} selector`
            : `${part[0]?.toUpperCase()}${part.slice(1)} selector`;
        return (
          <fieldset
            key={f.id}
            className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
          >
            {many && <legend className="px-1 font-medium text-xs">Feed {i + 1}</legend>}
            <span className="text-xs text-zinc-500">Container (the feed's list element)</span>
            <SelectorField
              label={name('container')}
              value={d.container}
              onChange={(s) => setFeed(i, 'container', s)}
            />
            <span className="text-xs text-zinc-500">
              Item (each post, matched inside the container)
            </span>
            <SelectorField
              label={name('item')}
              value={d.item}
              onChange={(s) => setFeed(i, 'item', s)}
            />
            <span className="text-xs text-zinc-500">
              Post link (inside each item; leave empty to pick it automatically)
            </span>
            <LinkField
              label={name('link')}
              value={d.link}
              options={entry.links?.[f.id]?.options ?? []}
              base={`https://${site.hostname}/`}
              onChange={(s) => setFeed(i, 'link', s)}
            />
          </fieldset>
        );
      })}
      {site.builtin && (
        <p className="text-xs text-zinc-500">
          Selectors you change here are kept as yours; Ghostify updates won’t replace them until you
          restore the built-in version.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-2 text-red-700 text-xs dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary}>
          Save
        </button>
      </div>
    </form>
  );
}

const badge = 'rounded-full px-2 py-0.5 text-xs';

function PageItem(props: {
  site: Site;
  index: number;
  entry: SiteProfileEntry;
  shipped?: SiteProfileEntry;
}) {
  const { site, index, entry: e, shipped } = props;
  const [editing, setEditing] = useState(false);
  const path = e.profile.pathPattern;
  const edited = shipped !== undefined && isPageCustomized(e, shipped);
  return (
    <li className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      {editing ? (
        <PageForm site={site} index={index} entry={e} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <code className="font-semibold">{path}</code>
            <span className={`${badge} bg-zinc-200 dark:bg-zinc-800`}>{VIEW_LABEL[e.view]}</span>
            {shipped && <BuiltIn />}
            {edited && (
              <span
                className={`${badge} bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300`}
              >
                edited
              </span>
            )}
            <span className="ml-auto" />
            {edited && (
              <IconButton
                label={`Restore built-in ${path}`}
                onClick={() => {
                  if (
                    confirm(
                      `Restore ${path} to its built-in view, path and selectors? Your changes to this page are lost.`,
                    )
                  )
                    void saveSite(restorePage(site, index));
                }}
              >
                <RotateCcw className="size-3.5" />
              </IconButton>
            )}
            <IconButton label={`Edit ${path}`} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton
              label={`Remove ${path}`}
              onClick={() =>
                void saveSite({ ...site, profiles: site.profiles.filter((_, j) => j !== index) })
              }
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
          <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {e.profile.feeds.map((f) => (
              <li key={f.id}>
                {f.container.value} → {f.item.value}
                {e.links?.[f.id]?.selector.value && ` → link: ${e.links[f.id]?.selector.value}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
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
  return <SiteDetailBody site={site} />;
}

function SiteDetailBody({ site }: { site: Site }) {
  const [restoring, setRestoring] = useState(false);
  const links = shippedPages(site);
  const status = builtinStatus(site);
  const ind = site.loginIndicator;
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
          {status && (
            <button
              type="button"
              className={btn}
              disabled={!status.customized && status.ownPages.length === 0}
              title={
                status.customized || status.ownPages.length
                  ? undefined
                  : 'This site already matches its built-in settings'
              }
              onClick={() => setRestoring(true)}
            >
              <RotateCcw className="size-4" /> Restore built-in settings
            </button>
          )}
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
        <IndicatorEditor key={`${site.id}:${ind?.selector}:${ind?.whenPresent}`} site={site} />
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
            <PageItem key={pageKey(e)} site={site} index={i} entry={e} shipped={links[i]} />
          ))}
        </ul>
      </div>
      {restoring && status && (
        <RestoreDialog site={site} ownPages={status.ownPages} onClose={() => setRestoring(false)} />
      )}
    </section>
  );
}

function RestoreDialog(props: { site: Site; ownPages: SiteProfileEntry[]; onClose(): void }) {
  const { site, ownPages, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const restore = (keep: boolean) => {
    void saveSite(restoreSite(site, keep));
    onClose();
  };
  const n = ownPages.length;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel restore"
        className="absolute inset-0 cursor-default bg-zinc-950/30"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        className="relative flex w-full max-w-lg flex-col gap-3 rounded-2xl bg-white p-5 text-sm shadow-2xl outline-none dark:bg-zinc-900"
      >
        <h2 id="restore-title" className="font-semibold text-base">
          Restore built-in settings?
        </h2>
        <p className="text-zinc-600 dark:text-zinc-300">
          {site.label}’s built-in pages, their selectors and the login indicator go back to how
          Ghostify ships them. The on/off switch and auto-ghostify rules stay as they are.
        </p>
        {n > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-zinc-600 dark:text-zinc-300">
              You added {n === 1 ? 'this page' : `these ${n} pages`} yourself:
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {ownPages.map((e) => (
                <li key={pageKey(e)} className={`${badge} bg-zinc-100 dark:bg-zinc-800`}>
                  <code>{e.profile.pathPattern}</code> · {VIEW_LABEL[e.view]}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          {n > 0 ? (
            <>
              <button type="button" className={btnDanger} onClick={() => restore(false)}>
                Restore, remove my pages
              </button>
              <button type="button" className={btnPrimary} onClick={() => restore(true)}>
                Restore, keep my pages
              </button>
            </>
          ) : (
            <button type="button" className={btnPrimary} onClick={() => restore(true)}>
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
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
