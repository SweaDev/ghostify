import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  Download,
  Loader2,
  MonitorSmartphone,
  Trash2,
} from 'lucide-react';
import {
  browserModel,
  type Device,
  DeviceUnsupportedError,
  specFor,
  specKey,
} from '../ai/browser/catalog';
import { sendMessage } from '../messaging';
import type { Purpose, Settings } from '../store/settings';
import { btn, btnPrimary, btnQuiet, card } from './kit';
import { useBrowserModels } from './useBrowserModels';

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;

/** Approximate download size of a model on a device, or undefined for a typed (unknown) model. */
export function sizeOf(model: string, purpose: Purpose, device: Device): number | undefined {
  return browserModel(model, purpose).mb?.[device];
}

const download = (purpose: Purpose, model: string) =>
  void sendMessage('browserModel', { action: 'download', purpose, model });

type State =
  | { kind: 'ready'; bytes: number }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'failed'; error: string }
  /** Can't be downloaded: an invalid id, or a model the chosen device can't run. */
  | { kind: 'unavailable'; error: string; device: boolean }
  | { kind: 'missing' };

/** Where a purpose's in-browser model is: on this device, downloading, failed or not yet. */
export function useModelState(settings: Settings, purpose: Purpose): State {
  const { downloaded, downloads } = useBrowserModels();
  const ref = settings.ai[purpose];
  let key: string;
  try {
    key = specKey(specFor(ref.model, purpose, settings.ai.device));
  } catch (e) {
    const device = e instanceof DeviceUnsupportedError;
    return { kind: 'unavailable', error: (e as Error).message, device };
  }
  const done = downloaded[key];
  if (done) return { kind: 'ready', bytes: done.bytes };
  const dl = downloads[key];
  if (dl?.error) return { kind: 'failed', error: dl.error };
  if (dl) return { kind: 'downloading', loaded: dl.loaded, total: dl.total };
  return { kind: 'missing' };
}

/** Status, size and Download / Delete for one purpose's in-browser model. */
export function BrowserModelStatus(props: { settings: Settings; purpose: Purpose }) {
  const { settings, purpose } = props;
  const ref = settings.ai[purpose];
  const state = useModelState(settings, purpose);
  const info = browserModel(ref.model, purpose);
  const size = sizeOf(ref.model, purpose, settings.ai.device);
  const pct =
    state.kind === 'downloading' && state.total
      ? Math.floor((state.loaded / state.total) * 100)
      : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{info.label}</span>
        {info.hint && <span className="text-zinc-500">{info.hint}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {state.kind === 'ready' && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> On this device
              {state.bytes ? ` · ${mb(state.bytes)}` : ''}
            </span>
          )}
          {/* A model the device can't run may still have files from an earlier download. */}
          {(state.kind === 'ready' || (state.kind === 'unavailable' && state.device)) && (
            <button
              type="button"
              className={`${btnQuiet} px-2 py-1 text-xs`}
              aria-label={`Delete ${info.label}`}
              onClick={() =>
                void sendMessage('browserModel', { action: 'delete', purpose, model: ref.model })
              }
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
          {state.kind === 'downloading' && (
            <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
              <Loader2 className="size-3.5 animate-spin" /> Downloading
              {state.total ? ` ${pct}% of ${mb(state.total)}` : '…'}
            </span>
          )}
          {(state.kind === 'missing' || state.kind === 'failed') && (
            <button
              type="button"
              className={`${btnPrimary} px-2.5 py-1 text-xs`}
              onClick={() => download(purpose, ref.model)}
            >
              <Download className="size-3.5" />
              {state.kind === 'failed' ? 'Retry download' : 'Download'}
              {size ? ` (~${size} MB)` : ''}
            </button>
          )}
        </span>
      </div>
      {state.kind === 'downloading' && (
        <div className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-ghost-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {(state.kind === 'failed' || state.kind === 'unavailable') && (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <CircleAlert className="size-3.5 shrink-0" /> {state.error}
        </span>
      )}
      {state.kind === 'missing' && (
        <span className="text-zinc-500">
          Downloaded once from Hugging Face, then it runs on this device. Nothing you ghost is sent
          anywhere.
        </span>
      )}
    </div>
  );
}

const DEVICES: { key: Device; label: string; hint: string; icon: typeof Cpu }[] = [
  { key: 'wasm', label: 'CPU', hint: 'Works on every computer', icon: Cpu },
  {
    key: 'webgpu',
    label: 'GPU (WebGPU)',
    hint: 'Faster, needs a supported GPU',
    icon: MonitorSmartphone,
  },
];

/** Where in-browser models run, and one button to download every missing one. */
export function BrowserRuntime(props: {
  settings: Settings;
  purposes: Purpose[];
  onDevice(d: Device): void;
}) {
  const { settings, purposes } = props;
  const { downloaded, downloads } = useBrowserModels();
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const missing = purposes.filter((p) => {
    try {
      const k = specKey(specFor(settings.ai[p].model, p, settings.ai.device));
      return !downloaded[k] && !downloads[k];
    } catch {
      return false;
    }
  });
  const total = missing.reduce(
    (n, p) => n + (sizeOf(settings.ai[p].model, p, settings.ai.device) ?? 0),
    0,
  );
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <div className="font-medium text-sm">In-browser models</div>
          <div className="text-xs text-zinc-500">
            Small models that run inside the browser: no GPU, Ollama or API key needed.
          </div>
        </div>
        <fieldset aria-label="Run in-browser models on" className="flex gap-1">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            const on = settings.ai.device === d.key;
            return (
              <button
                key={d.key}
                type="button"
                aria-pressed={on}
                title={d.hint}
                disabled={d.key === 'webgpu' && !gpu && !on}
                onClick={() => props.onDevice(d.key)}
                className={`${on ? btnPrimary : btn} px-2.5 py-1 text-xs`}
              >
                <Icon className="size-3.5" /> {d.label}
              </button>
            );
          })}
        </fieldset>
      </div>
      {!gpu && (
        <p className="mt-2 text-xs text-zinc-500">
          This browser has no WebGPU, so models run on the CPU.
        </p>
      )}
      {missing.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              for (const p of missing) download(p, settings.ai[p].model);
            }}
          >
            <Download className="size-4" /> Download all{total ? ` (~${total} MB)` : ''}
          </button>
          <span className="text-xs text-zinc-500">
            Each model is fetched once and kept in the browser's cache. Delete them any time.
          </span>
        </div>
      )}
    </div>
  );
}
