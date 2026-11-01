import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { hasModel, type OllamaStatus, ollamaStatus, SUGGESTED } from '../ai/models';
import { sendMessage } from '../messaging';
import { getKeys, saveKey } from '../store/secrets';
import type { Keys, ModelRef, Provider, Purpose, Settings } from '../store/settings';
import { useSettings } from './GeneralSettings';
import { Switch } from './Switch';

const PURPOSES: { key: Purpose; label: string; hint: string }[] = [
  { key: 'embedding', label: 'Embeddings', hint: 'Semantic search over your ghosts' },
  { key: 'general', label: 'General model', hint: 'Summaries and tags' },
  { key: 'decision', label: 'Decision model', hint: 'Auto-ghostify rules' },
];
const PROVIDERS: { key: Provider; label: string }[] = [
  { key: 'ollama', label: 'Ollama (local)' },
  { key: 'openrouter', label: 'OpenRouter' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI' },
];
const field =
  'rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const card =
  'rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50';

function Status(props: { state?: 'busy' | { ok: boolean; message: string } }) {
  const s = props.state;
  if (!s) return null;
  if (s === 'busy')
    return <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Checking" />;
  const Icon = s.ok ? CheckCircle2 : CircleAlert;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${s.ok ? 'text-emerald-600' : 'text-amber-600'}`}
    >
      <Icon className="size-4" /> {s.message}
    </span>
  );
}

function Row(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <div className="min-w-40 flex-1">
        <div className="font-medium text-sm">{props.label}</div>
        {props.hint && <div className="text-xs text-zinc-500">{props.hint}</div>}
      </div>
      {props.children}
    </div>
  );
}

const ORIGINS = 'chrome-extension://*,moz-extension://*';
type Os = 'linux' | 'mac' | 'windows' | 'terminal';
const OS_LABELS: Record<Os, string> = {
  linux: 'Linux',
  mac: 'macOS',
  windows: 'Windows',
  terminal: 'Terminal',
};

function ollamaHost(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return `${u.hostname}:${u.port || '11434'}`;
  } catch {
    return '127.0.0.1:11434';
  }
}

function setupSnippet(os: Os, host: string): string {
  switch (os) {
    case 'linux':
      return `sudo systemctl edit ollama
# add:
[Service]
Environment="OLLAMA_HOST=${host}"
Environment="OLLAMA_ORIGINS=${ORIGINS}"
# then:
sudo systemctl restart ollama`;
    case 'mac':
      return `launchctl setenv OLLAMA_HOST "${host}"
launchctl setenv OLLAMA_ORIGINS "${ORIGINS}"
# then quit and reopen the Ollama app`;
    case 'windows':
      return `setx OLLAMA_HOST "${host}"
setx OLLAMA_ORIGINS "${ORIGINS}"
# then quit Ollama from the tray and start it again`;
    case 'terminal':
      return `# only if Ollama isn't already running as a service
OLLAMA_HOST=${host} OLLAMA_ORIGINS="${ORIGINS}" ollama serve`;
  }
}

function OllamaSetup(props: { baseUrl: string }) {
  const ua = navigator.userAgent;
  const [os, setOs] = useState<Os>(/Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'windows' : 'linux');
  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-500">
        Let Ollama accept requests from extensions. Without this, the browser shows a CORS error.
        Set the variables on the Ollama server that is running.
      </p>
      <div className="mt-2 flex gap-1">
        {(Object.keys(OS_LABELS) as Os[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setOs(k)}
            className={`rounded-md px-2 py-0.5 text-xs ${
              os === k ? 'bg-zinc-200 dark:bg-zinc-700' : 'text-zinc-500'
            }`}
          >
            {OS_LABELS[k]}
          </button>
        ))}
      </div>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
        {setupSnippet(os, ollamaHost(props.baseUrl))}
      </pre>
    </div>
  );
}

export function AiSettings() {
  const [settings, update] = useSettings();
  const [keys, setKeys] = useState<Keys>({});
  const [ollama, setOllama] = useState<OllamaStatus>();
  const [checks, setChecks] = useState<
    Partial<Record<Purpose, 'busy' | { ok: boolean; message: string }>>
  >({});

  const [reindexed, setReindexed] = useState<string>();
  useEffect(() => void getKeys().then(setKeys), []);
  const url = settings?.ai.ollamaBaseUrl;
  useEffect(() => {
    if (url) void ollamaStatus(url).then(setOllama);
  }, [url]);
  if (!settings) return null;

  const setAi = (ai: Partial<Settings['ai']>) =>
    update({ ...settings, ai: { ...settings.ai, ...ai } });
  const setRef = (p: Purpose, ref: Partial<ModelRef>) => {
    const next = { ...settings.ai[p], ...ref };
    if (ref.provider) next.model = SUGGESTED[ref.provider][p][0] ?? '';
    setAi({ [p]: next });
  };
  const check = async (p: Purpose) => {
    setChecks((c) => ({ ...c, [p]: 'busy' }));
    const r = await sendMessage('checkAi', { purpose: p }).catch((e: Error) => ({
      ok: false,
      message: e.message,
    }));
    setChecks((c) => ({ ...c, [p]: r }));
  };
  const reindex = async () => {
    const n = await sendMessage('reindex', undefined);
    setReindexed(
      n ? `Embedding ${n} item${n === 1 ? '' : 's'} in the background…` : 'All items are indexed.',
    );
  };
  const usesOllama = PURPOSES.some((p) => settings.ai[p.key].provider === 'ollama');
  const cloud = [...new Set(PURPOSES.map((p) => settings.ai[p.key].provider))].filter(
    (p): p is Exclude<Provider, 'ollama'> => p !== 'ollama',
  );

  return (
    <section className="flex flex-col gap-4">
      <div className={`${card} flex items-center gap-3`}>
        <div className="flex-1">
          <div className="font-medium">Use AI</div>
          <div className="text-sm text-zinc-500">
            Summaries, tags, semantic search and auto-ghostify rules. Off by default; nothing leaves
            your machine with Ollama.
          </div>
        </div>
        <Switch
          checked={settings.ai.enabled}
          label="Use AI"
          onChange={(enabled) => setAi({ enabled })}
        />
      </div>

      <div className={card}>
        {PURPOSES.map((p) => {
          const ref = settings.ai[p.key];
          const missing =
            ref.provider === 'ollama' && ollama?.ok && !hasModel(ollama.models, ref.model);
          return (
            <div
              key={p.key}
              className="border-zinc-100 border-b last:border-0 dark:border-zinc-800"
            >
              <Row label={p.label} hint={p.hint}>
                <select
                  aria-label={`${p.label} provider`}
                  value={ref.provider}
                  onChange={(e) => setRef(p.key, { provider: e.target.value as Provider })}
                  className={field}
                >
                  {PROVIDERS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${p.label} model`}
                  list={`models-${p.key}`}
                  value={ref.model}
                  onChange={(e) => setRef(p.key, { model: e.target.value })}
                  className={`${field} w-56 font-mono text-xs`}
                />
                <datalist id={`models-${p.key}`}>
                  {SUGGESTED[ref.provider][p.key].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <button type="button" className={field} onClick={() => void check(p.key)}>
                  Test
                </button>
              </Row>
              <div className="flex min-h-5 flex-wrap gap-2 pb-2">
                {missing && (
                  <span className="text-amber-600 text-xs">
                    Not pulled yet: <code>ollama pull {ref.model}</code>
                  </span>
                )}
                <Status state={checks[p.key]} />
              </div>
            </div>
          );
        })}
      </div>

      {settings.ai.enabled && (
        <div className={`${card} flex flex-wrap items-center gap-3`}>
          <div className="flex-1">
            <div className="font-medium text-sm">Search index</div>
            <div className="text-xs text-zinc-500">
              Embeds ghosts saved before AI was on, or after changing the embedding model.
            </div>
          </div>
          {reindexed && <span className="text-xs text-zinc-500">{reindexed}</span>}
          <button type="button" className={field} onClick={() => void reindex()}>
            Reindex
          </button>
        </div>
      )}

      {usesOllama && (
        <div className={card}>
          <Row label="Ollama" hint="Runs models locally">
            <input
              aria-label="Ollama URL"
              value={settings.ai.ollamaBaseUrl}
              onChange={(e) => setAi({ ollamaBaseUrl: e.target.value })}
              className={`${field} w-64 font-mono text-xs`}
            />
            <Status
              state={
                ollama && {
                  ok: ollama.ok,
                  message: ollama.ok
                    ? `${ollama.models.length} models available`
                    : (ollama.error ?? ''),
                }
              }
            />
          </Row>
          <OllamaSetup baseUrl={settings.ai.ollamaBaseUrl} />
        </div>
      )}

      {cloud.length > 0 && (
        <div className={card}>
          <div className="mb-1 font-medium">API keys</div>
          <p className="mb-2 text-xs text-zinc-500">
            Stored only in this browser's extension storage and sent only to the provider.
          </p>
          {cloud.map((p) => (
            <Row key={p} label={PROVIDERS.find((x) => x.key === p)?.label ?? p}>
              <input
                type="password"
                aria-label={`${p} API key`}
                placeholder="API key"
                value={keys[p] ?? ''}
                onChange={(e) => setKeys((k) => ({ ...k, [p]: e.target.value }))}
                onBlur={(e) => void saveKey(p, e.target.value)}
                className={`${field} w-72 font-mono text-xs`}
              />
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}
