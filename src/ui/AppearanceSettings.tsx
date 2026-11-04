import { RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import {
  type ButtonPlacement,
  type Corner,
  DEFAULT_SETTINGS,
  MAX_BUTTON_MARGIN,
  type Settings,
} from '../store/settings';
import { GhostIcon } from './GhostIcon';
import { btnQuiet, card, field } from './kit';
import { useSites } from './SitesSettings';
import { Switch } from './Switch';
import { useSettings } from './useSettings';

const CORNERS: { key: Corner; label: string }[] = [
  { key: 'top-left', label: 'Top left' },
  { key: 'top-right', label: 'Top right' },
  { key: 'bottom-left', label: 'Bottom left' },
  { key: 'bottom-right', label: 'Bottom right' },
];

/** Preview offsets are capped so large margins still fit the mock item. */
const PREVIEW_MAX = 40;

const clampMargin = (n: number) =>
  Number.isFinite(n) ? Math.min(MAX_BUTTON_MARGIN, Math.max(0, Math.round(n))) : 0;

export function AppearanceSettings() {
  const [settings, update] = useSettings();
  if (!settings) return null;
  const setUi = (ui: Partial<Settings['ui']>) =>
    update({ ...settings, ui: { ...settings.ui, ...ui } });
  return (
    <section className="flex flex-col gap-4">
      <label className={`${card} flex items-center justify-between gap-4`}>
        <span>
          <span className="block font-medium">Theme</span>
          <span className="text-sm text-zinc-500">Applies to the popup and Ghostify pages.</span>
        </span>
        <select
          value={settings.ui.theme}
          onChange={(e) => setUi({ theme: e.target.value as Settings['ui']['theme'] })}
          className={field}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <ButtonPlacementCard ui={settings.ui} setUi={setUi} />
    </section>
  );
}

function ButtonPlacementCard(props: {
  ui: Settings['ui'];
  setUi(ui: Partial<Settings['ui']>): void;
}) {
  const { ui, setUi } = props;
  const sites = useSites();
  const scopeId = useId();
  const [scope, setScope] = useState('');
  const site = sites?.find((s) => s.id === scope);
  const override = site && ui.siteGhostButtons[site.id];
  const value = override || ui.ghostButton;
  const setOverride = (p?: ButtonPlacement) => {
    if (!site) return;
    const { [site.id]: _, ...rest } = ui.siteGhostButtons;
    setUi({ siteGhostButtons: p ? { ...rest, [site.id]: p } : rest });
  };
  const onChange = (p: ButtonPlacement) => (site ? setOverride(p) : setUi({ ghostButton: p }));
  const set = (p: Partial<ButtonPlacement>) => onChange({ ...value, ...p });
  const fallback = DEFAULT_SETTINGS.ui.ghostButton;
  const isDefault = (Object.keys(fallback) as (keyof ButtonPlacement)[]).every(
    (k) => value[k] === fallback[k],
  );
  const top = value.corner.startsWith('top');
  const left = value.corner.endsWith('left');
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Ghost button</h3>
          <p className="text-sm text-zinc-500">
            Where the 👻 button sits on a feed item you hover. If it covers something you need, pick
            another corner, then fine-tune its distance from the edges. Pick a site to give it its
            own position.
          </p>
        </div>
        {!site && !isDefault && (
          <button type="button" className={btnQuiet} onClick={() => onChange(fallback)}>
            <RotateCcw className="size-4" /> Reset
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label htmlFor={scopeId} className="text-zinc-600 dark:text-zinc-300">
          Applies to
        </label>
        <select
          id={scopeId}
          value={site ? scope : ''}
          onChange={(e) => setScope(e.target.value)}
          className={field}
        >
          <option value="">All sites</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {ui.siteGhostButtons[s.id] ? ' (own position)' : ''}
            </option>
          ))}
        </select>
        {site && (
          <span className="flex items-center gap-2">
            <Switch
              checked={!!override}
              label={`Own position on ${site.label}`}
              onChange={(on) => setOverride(on ? ui.ghostButton : undefined)}
            />
            <span className="text-zinc-500">
              {override ? `Own position on ${site.label}` : 'Uses the all-sites position'}
            </span>
          </span>
        )}
      </div>
      <fieldset
        disabled={!!site && !override}
        className="mt-4 flex min-w-0 flex-col gap-5 transition disabled:opacity-50 sm:flex-row sm:items-center"
      >
        <fieldset className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 sm:w-72 dark:border-zinc-800 dark:bg-zinc-950/60">
          <legend className="sr-only">Button corner</legend>
          <MockItem />
          {CORNERS.map((c) => (
            <CornerOption
              key={c.key}
              corner={c.key}
              label={c.label}
              placement={value}
              onSelect={() => set({ corner: c.key })}
            />
          ))}
        </fieldset>
        <div className="flex flex-col gap-3">
          <MarginInput
            label={top ? 'From top' : 'From bottom'}
            value={value.vertical}
            onChange={(vertical) => set({ vertical })}
          />
          <MarginInput
            label={left ? 'From left' : 'From right'}
            value={value.horizontal}
            onChange={(horizontal) => set({ horizontal })}
          />
        </div>
      </fieldset>
    </div>
  );
}

/** Skeleton of a feed item (thumbnail and text lines), purely decorative. */
function MockItem() {
  const line = 'h-2 rounded-full bg-zinc-200 dark:bg-zinc-800';
  return (
    <div aria-hidden="true" className="flex h-full gap-3 p-4">
      <div className="h-full w-20 shrink-0 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        <div className={`${line} w-11/12 bg-zinc-300 dark:bg-zinc-700`} />
        <div className={`${line} w-3/4`} />
        <div className={`${line} w-5/6`} />
        <div className={`${line} w-1/2`} />
      </div>
    </div>
  );
}

function CornerOption(props: {
  corner: Corner;
  label: string;
  placement: ButtonPlacement;
  onSelect(): void;
}) {
  const { corner, label, placement, onSelect } = props;
  const on = placement.corner === corner;
  const y = on ? Math.min(placement.vertical, PREVIEW_MAX) : 6;
  const x = on ? Math.min(placement.horizontal, PREVIEW_MAX) : 6;
  return (
    <label
      title={label}
      style={{
        [corner.startsWith('top') ? 'top' : 'bottom']: y,
        [corner.endsWith('left') ? 'left' : 'right']: x,
      }}
      className="group/c absolute size-8 cursor-pointer transition-all"
    >
      <input
        type="radio"
        name="ghost-button-corner"
        aria-label={label}
        checked={on}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        className={`grid size-full place-items-center rounded-full transition peer-focus-visible:outline-2 peer-focus-visible:outline-ghost-500 peer-focus-visible:outline-offset-2 ${
          on
            ? 'bg-gradient-to-br from-ghost-500 to-blue-500 p-1 shadow-ghost-500/40 shadow-lg ring-1 ring-white/30'
            : 'border-2 border-ghost-300/70 border-dashed bg-white/70 group-hover/c:border-ghost-400 dark:border-ghost-700 dark:bg-zinc-900/70'
        }`}
      >
        <GhostIcon
          className={
            on ? 'size-full drop-shadow-sm' : 'size-4 opacity-0 transition group-hover/c:opacity-60'
          }
        />
      </span>
    </label>
  );
}

function MarginInput(props: { label: string; value: number; onChange(n: number): void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id} className="w-24 text-zinc-600 dark:text-zinc-300">
        {props.label}
      </label>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={0}
          max={MAX_BUTTON_MARGIN}
          step={1}
          value={props.value}
          onChange={(e) => props.onChange(clampMargin(e.target.valueAsNumber))}
          className={`${field} w-20 tabular-nums`}
        />
        <span aria-hidden="true" className="text-zinc-400">
          px
        </span>
      </span>
    </div>
  );
}
