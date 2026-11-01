import { cosine, MIN_SCORE, modelTag, rank } from '@/src/ai/embed';
import * as models from '@/src/ai/models';
import { backfill, reindex } from '@/src/background/indexer';
import { afterGhostify, runJob, searchSemantic } from '@/src/background/jobs';
import { db } from '@/src/store/db';
import { indexProgress, indexStatus } from '@/src/store/index-status';
import { ghostify, setState } from '@/src/store/items';
import { DEFAULT_SETTINGS, saveSettings, withDefaults } from '@/src/store/settings';
import { eta } from '@/src/ui/IndexProgress';
import { embedModel, textModel } from './mock-model';
import { OLLAMA_AI } from './ollama-ai';

// Toy embedding: [mentions rust, mentions css, constant].
const vec = (t: string) => [/rust/i.test(t) ? 1 : 0, /css|style/i.test(t) ? 1 : 0, 0.1];
const draft = (id: string, title: string) => ({
  id,
  host: 'h',
  siteId: 's',
  view: 'any' as const,
  title,
  excerpt: '',
});
const tag = modelTag(OLLAMA_AI.embedding);

beforeEach(async () => {
  await db.items.clear();
  await db.embeddings.clear();
  vi.spyOn(models, 'embeddingModel').mockReturnValue(embedModel(vec));
  vi.spyOn(models, 'languageModel').mockReturnValue(textModel('{"summary":"s","tags":[]}'));
});
afterEach(() => vi.restoreAllMocks());
const aiOn = () =>
  saveSettings(withDefaults({ ai: { ...DEFAULT_SETTINGS.ai, ...OLLAMA_AI, enabled: true } }));

describe('ranking', () => {
  it('computes cosine and ranks by model and score', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
    const e = (key: string, v: number[], model = tag) => ({ key, model, dim: v.length, vector: v });
    const ranked = rank(
      [1, 0, 0],
      [e('a', [0.5, 0.5, 0]), e('b', [1, 0, 0]), e('c', [0, 1, 0]), e('d', [1, 0, 0], 'x')],
      tag,
    );
    expect(ranked).toEqual(['b', 'a']);
    expect(MIN_SCORE).toBeGreaterThan(0);
  });
});

describe('semantic jobs', () => {
  it('embeds after ghostify and searches by meaning within filters', async () => {
    await aiOn();
    for (const [id, title] of [
      ['a', 'Rust ownership'],
      ['b', 'Modern CSS layouts'],
      ['c', 'Rust async'],
    ]) {
      const item = await ghostify(draft(id as string, title as string));
      await afterGhostify(item.key);
    }
    expect(await db.embeddings.count()).toBe(3);
    const r = await searchSemantic('rust language', {});
    expect(r.fallback).toBe(false);
    expect(r.items.map((i) => i.id).sort()).toEqual(['a', 'c']);
    await setState('h:c', 'later');
    expect((await searchSemantic('rust', { state: 'ghost' })).items.map((i) => i.id)).toEqual([
      'a',
    ]);
  });

  it('falls back to keyword search when AI is off or embedding fails', async () => {
    await ghostify(draft('a', 'Rust ownership'));
    expect(await searchSemantic('ownership', {})).toMatchObject({
      fallback: true,
      items: [{ id: 'a' }],
    });
    await aiOn();
    vi.spyOn(models, 'embeddingModel').mockImplementation(() => {
      throw new Error('no key');
    });
    expect((await searchSemantic('ownership', {})).fallback).toBe(true);
  });

  it('reindexes items without an embedding for the current model', async () => {
    await ghostify(draft('a', 'Rust'));
    await ghostify(draft('b', 'CSS'));
    expect(await reindex()).toBe(0); // AI off
    await aiOn();
    expect(await reindex()).toBe(2);
    await vi.waitFor(async () => expect(await db.embeddings.count()).toBe(2));
    expect(await reindex()).toBe(0);
  });

  it('backfills in the background after queued jobs and reports progress', async () => {
    await ghostify(draft('a', 'Rust'));
    await ghostify(draft('b', 'CSS'));
    await aiOn();
    await db.embeddings.clear();
    expect(await indexProgress(tag)).toEqual({ total: 2, indexed: 0 });
    let release!: () => void;
    const busy = runJob(
      { kind: 'check', label: 'busy' },
      () => new Promise<void>((r) => (release = r)),
    );
    const run = backfill();
    await new Promise((r) => setTimeout(r, 20));
    expect(await db.embeddings.count()).toBe(0); // waits for the queued job
    expect(await indexStatus.getValue()).toMatchObject({ running: true, startIndexed: 0 });
    release();
    await busy;
    await run;
    expect(await indexProgress(tag)).toEqual({ total: 2, indexed: 2 });
    expect(await indexStatus.getValue()).toEqual({ running: false });
  });

  it('stops with an error when embedding fails', async () => {
    await ghostify(draft('a', 'Rust'));
    await aiOn();
    await db.embeddings.clear();
    vi.spyOn(models, 'embeddingModel').mockImplementation(() => {
      throw new Error('Ollama down');
    });
    await backfill();
    expect(await indexStatus.getValue()).toEqual({ running: false, error: 'Ollama down' });
  });
});

describe('eta', () => {
  it('estimates the time left from progress since the run started', () => {
    const s = { running: true, startedAt: 0, startIndexed: 10 };
    expect(eta(s, 12, 100, 60_000)).toBeUndefined(); // too few done for a rate
    expect(eta(s, 20, 100, 60_000)).toBe('about 8 min left');
    expect(eta(s, 99, 100, 60_000)).toBe('less than a minute left');
    expect(eta(s, 20, 2000, 60_000)).toBe('about 3 h left');
  });
});
