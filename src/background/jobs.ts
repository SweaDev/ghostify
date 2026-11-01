import { embed } from 'ai';
import { BROWSER_MAX_CONTENT, isReady, notDownloaded } from '../ai/browser/provider';
import { askContent, contentText, digestContent, MAX_CONTENT } from '../ai/content';
import { embedItem, modelTag, rank } from '../ai/embed';
import { enrichItem, itemText } from '../ai/enrich';
import { embeddingModel, languageModel } from '../ai/models';
import { type ContentRow, db, type GhostItem, type QaEntry } from '../store/db';
import { getItem, type ListQuery, listItems, updateItem } from '../store/items';
import { getKeys } from '../store/secrets';
import { getSettings, prompt, type Settings } from '../store/settings';
import { enqueue, JobStopped, runJob, stopJob } from './ai-queue';

export { enqueue, runJob, whenIdle } from './ai-queue';

const env = () => Promise.all([getSettings(), getKeys()]);

/** Summary and tags for an item (general model). No-op while AI is off or when it has a summary. */
export async function enrich(key: string, force = false): Promise<void> {
  const [settings, item] = await Promise.all([getSettings(), getItem(key)]);
  if (!settings.ai.enabled || !item || (item.summary && !force)) return;
  // In-browser model not downloaded: skip quietly (asked for explicitly: say why).
  if (!(await isReady(settings, 'general'))) {
    if (force) throw notDownloaded('general');
    return;
  }
  await runJob(
    {
      kind: 'enrich',
      label: item.title,
      itemKey: key,
      model: modelTag(settings.ai.general),
      system: prompt(settings, 'enrich'),
      input: itemText(item),
    },
    async ({ signal, update }) => {
      const [s, keys] = await env();
      const it = await getItem(key);
      if (!s.ai.enabled || !it) return;
      const r = await enrichItem(it, languageModel(s.ai.general, s, keys), {
        system: prompt(s, 'enrich'),
        signal,
      });
      await updateItem(key, r);
      update({ output: `${r.summary}\n${r.tags.map((t) => `#${t}`).join(' ')}` });
    },
  );
}

export async function embedKey(key: string): Promise<void> {
  const [settings, item] = await Promise.all([getSettings(), getItem(key)]);
  if (!settings.ai.enabled || !item || !(await isReady(settings, 'embedding'))) return;
  await runJob(
    { kind: 'embed', label: item.title, itemKey: key, model: modelTag(settings.ai.embedding) },
    async ({ signal, update }) => {
      const [s, keys] = await env();
      const it = await getItem(key);
      if (!s.ai.enabled || !it) return;
      const ref = s.ai.embedding;
      const e = await embedItem(it, embeddingModel(ref, s, keys), modelTag(ref), signal);
      await db.embeddings.put(e);
      update({ output: `${e.dim} dimensions` });
    },
  );
}

/** AI work after an item is ghostified (no-op while AI is off). */
export async function afterGhostify(key: string): Promise<void> {
  await enrich(key).catch((e) => {
    if (!(e instanceof JobStopped)) console.warn('[ghostify:ai] enrich', e);
  });
  await embedKey(key).catch((e) => {
    if (!(e instanceof JobStopped)) console.warn('[ghostify:ai] embed', e);
  });
}

export interface SearchResult {
  items: GhostItem[];
  /** True when semantic search was not possible and keyword search was used. */
  fallback: boolean;
}

/** Semantic search within the filters; falls back to keyword search when AI fails, is off or paused. */
export async function searchSemantic(query: string, filters: ListQuery): Promise<SearchResult> {
  const keyword = async () => ({
    items: await listItems({ ...filters, text: query }),
    fallback: true,
  });
  const [settings, keys] = await env();
  if (!settings.ai.enabled || !query.trim() || !(await isReady(settings, 'embedding')))
    return keyword();
  const ref = settings.ai.embedding;
  try {
    const { embedding } = await runJob(
      {
        kind: 'search',
        label: query,
        model: modelTag(ref),
        input: query,
        high: true,
        pausable: false,
        failIfPaused: true,
      },
      ({ signal }) =>
        embed({ model: embeddingModel(ref, settings, keys), value: query, abortSignal: signal }),
    );
    const tag = modelTag(ref);
    const ranked = rank(embedding, await db.embeddings.where('model').equals(tag).toArray(), tag);
    const pool = new Map((await listItems({ ...filters, text: undefined })).map((i) => [i.key, i]));
    const items = ranked.map((k) => pool.get(k)).filter((i): i is GhostItem => !!i);
    return { items, fallback: false };
  } catch (e) {
    console.warn('[ghostify:ai] search', e);
    return keyword();
  }
}

/** How much article text the general model reads (small in-browser models read less). */
const maxContent = (s: Settings) =>
  s.ai.general.provider === 'browser' ? BROWSER_MAX_CONTENT : MAX_CONTENT;

/** The text AI reads for an item: its grabbed content, else what the feed showed. */
async function sourceText(
  key: string,
  max = MAX_CONTENT,
): Promise<{ item: GhostItem; text: string } | undefined> {
  const [item, content] = await Promise.all([getItem(key), db.contents.get(key)]);
  if (!item) return undefined;
  return { item, text: content?.text ? contentText(content, max) : itemText(item) };
}

const emptyContent = (item: GhostItem): ContentRow => ({
  key: item.key,
  url: item.url ?? '',
  title: item.title,
  html: '',
  text: '',
  fetchedAt: 0,
});

/** Removes a question (and stops its answer if it is still coming). */
export async function forget(key: string, qaId: string): Promise<void> {
  const c = await db.contents.get(key);
  const q = c?.qa?.find((x) => x.id === qaId);
  if (q?.jobId) await stopJob(q.jobId);
  if (c) await db.contents.update(key, { qa: c.qa?.filter((x) => x.id !== qaId) });
}

/** Streams a digest of the item's content into `contents.digest`. */
export async function digest(key: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.ai.enabled) throw new Error('Turn on AI in Settings → AI');
  const src = await sourceText(key, maxContent(settings));
  if (!src) return;
  if (!(await isReady(settings, 'general'))) {
    const c = (await db.contents.get(key)) ?? emptyContent(src.item);
    await db.contents.put({ ...c, digestError: notDownloaded('general').message });
    return;
  }
  const jobId = crypto.randomUUID();
  await db.transaction('rw', db.contents, async () => {
    const c = (await db.contents.get(key)) ?? emptyContent(src.item);
    await db.contents.put({ ...c, digestJob: jobId, digestError: undefined });
  });
  void enqueue(
    {
      id: jobId,
      kind: 'digest',
      label: src.item.title,
      itemKey: key,
      model: modelTag(settings.ai.general),
      system: prompt(settings, 'digest'),
      input: src.text,
      high: true,
    },
    async ({ signal, update }) => {
      try {
        const [s, keys] = await env();
        const cur = await sourceText(key, maxContent(s));
        if (!cur) return;
        let last = 0;
        const text = await digestContent(cur.text, {
          model: languageModel(s.ai.general, s, keys),
          system: prompt(s, 'digest'),
          signal,
          onText: (t) => {
            update({ output: t });
            if (Date.now() - last > 150) {
              last = Date.now();
              void db.contents.update(key, { digest: t });
            }
          },
        });
        await db.contents.update(key, { digest: text, digestAt: Date.now() });
      } catch (e) {
        if (!signal.aborted) await db.contents.update(key, { digestError: (e as Error).message });
        throw e;
      }
    },
  );
}

const patchQa = (key: string, id: string, patch: Partial<QaEntry>) =>
  db.contents
    .where('key')
    .equals(key)
    .modify((c) => {
      const q = c.qa?.find((x) => x.id === id);
      if (q) Object.assign(q, patch);
    });

/** Adds a question to the item's thread and streams the answer into it. Returns the entry id. */
export async function ask(key: string, question: string): Promise<string> {
  const settings = await getSettings();
  if (!settings.ai.enabled) throw new Error('Turn on AI in Settings → AI');
  const src = await sourceText(key, maxContent(settings));
  if (!src) throw new Error('Unknown item');
  const ready = await isReady(settings, 'general');
  const entry: QaEntry = {
    id: crypto.randomUUID(),
    q: question.trim(),
    a: '',
    at: Date.now(),
    ...(ready ? { jobId: crypto.randomUUID() } : { error: notDownloaded('general').message }),
  };
  await db.transaction('rw', db.contents, async () => {
    const c = (await db.contents.get(key)) ?? emptyContent(src.item);
    await db.contents.put({ ...c, qa: [...(c.qa ?? []), entry] });
  });
  if (!ready) return entry.id;
  void enqueue(
    {
      id: entry.jobId,
      kind: 'ask',
      label: entry.q,
      itemKey: key,
      model: modelTag(settings.ai.general),
      system: prompt(settings, 'ask'),
      input: entry.q,
      high: true,
    },
    async ({ signal, update }) => {
      await patchQa(key, entry.id, { error: undefined });
      try {
        const [s, keys] = await env();
        const cur = await sourceText(key, maxContent(s));
        const c = await db.contents.get(key);
        if (!cur) return;
        const history = (c?.qa ?? []).filter((x) => x.at < entry.at);
        let last = 0;
        const a = await askContent(cur.text, history, entry.q, {
          model: languageModel(s.ai.general, s, keys),
          system: prompt(s, 'ask'),
          signal,
          onText: (t) => {
            update({ output: t });
            if (Date.now() - last > 150) {
              last = Date.now();
              void patchQa(key, entry.id, { a: t });
            }
          },
        });
        await patchQa(key, entry.id, { a });
      } catch (e) {
        if (!signal.aborted) await patchQa(key, entry.id, { error: (e as Error).message });
        throw e;
      }
    },
  );
  return entry.id;
}
