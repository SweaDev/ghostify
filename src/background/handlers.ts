import { browser } from 'wxt/browser';
import { checkPurpose } from '../ai/check';
import { handleDecision } from '../ai/decision';
import { modelTag } from '../ai/embed';
import type { ProtocolMap } from '../messaging';
import { onMessage } from '../messaging';
import { autoGhostify, ghostedIds, ghostify, listItems, setState, unghost } from '../store/items';
import { getSettings } from '../store/settings';
import { pauseAll, pauseJob, resumeAll, resumeJob, runJob, stopAll, stopJob } from './ai-queue';
import { guard } from './guard';
import { reindex } from './indexer';
import { afterGhostify, ask, digest, embedKey, enrich, forget, searchSemantic } from './jobs';

const JOB = { pause: pauseJob, resume: resumeJob, stop: stopJob };
const ALL = { pause: pauseAll, resume: resumeAll, stop: stopAll };

function describe(req: unknown): { kind: 'decision' | 'detect'; label: string; input: string } {
  const r = req as { task?: string; criteria?: string[]; items?: { text: string }[] };
  if (r.task === 'classify')
    return {
      kind: 'decision',
      label: `${r.items?.length ?? 0} items · ${r.criteria?.join(' / ')}`,
      input: (r.items ?? []).map((i) => i.text.slice(0, 200)).join('\n---\n'),
    };
  return { kind: 'detect', label: 'Find feeds on a page', input: '' };
}

type Handlers = {
  [K in keyof ProtocolMap]: (
    data: Parameters<ProtocolMap[K]>[0],
  ) => ReturnType<ProtocolMap[K]> | Promise<ReturnType<ProtocolMap[K]>>;
};

export const handlers: Handlers = {
  isGhosted: ({ host, ids }) => ghostedIds(host, ids),
  ghostify: async (draft) => {
    const item = await ghostify(draft);
    void afterGhostify(item.key);
    return item;
  },
  unghost: ({ key }) => unghost(key),
  autoGhostify: async (draft) => {
    const item = await autoGhostify(draft);
    if (item) void afterGhostify(item.key);
    return item;
  },
  setState: ({ key, state, snoozeUntil }) => setState(key, state, snoozeUntil),
  listItems: (q) => listItems(q),
  openDashboard: async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  },
  checkAi: ({ purpose }) =>
    runJob({ kind: 'check', label: `Test ${purpose} model`, high: true, pausable: false }, () =>
      checkPurpose(purpose),
    ).catch((e: Error) => ({ ok: false, message: e.message })),
  enrich: async ({ key }) => {
    await enrich(key, true).catch(() => {});
    await embedKey(key).catch(() => {});
  },
  aiJob: ({ id, action }) => JOB[action](id),
  aiAll: ({ action }) => ALL[action](),
  digest: ({ key }) => digest(key),
  ask: ({ key, question }) => ask(key, question),
  forget: ({ key, qaId }) => forget(key, qaId),
  searchSemantic: ({ query, filters }) => searchSemantic(query, filters),
  reindex: () => reindex(),
  llm: async ({ req }) => {
    try {
      const d = describe(req);
      const res = await runJob(
        {
          ...d,
          model: modelTag((await getSettings()).ai[d.kind === 'decision' ? 'decision' : 'general']),
          high: true,
          pausable: false,
          failIfPaused: true,
        },
        async ({ signal, update }) => {
          const r = await handleDecision(req, { signal });
          update({ output: JSON.stringify(r).slice(0, 2000) });
          return r;
        },
      );
      return { ok: true, res };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return {
        ok: false,
        error: { code: err.code ?? 'LLM_UNAVAILABLE', message: String(err.message) },
      };
    }
  },
  addSite: async ({ tabId }) => {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/picker.js'],
    });
  },
};

export function registerHandlers(): void {
  for (const type of Object.keys(handlers) as (keyof ProtocolMap)[]) {
    // biome-ignore lint/suspicious/noExplicitAny: handler/data types are tied by the map above
    const handler = handlers[type] as (data: any) => unknown;
    onMessage(type, ({ data, sender }) => handler(guard(type, data, sender)) as never);
  }
}
