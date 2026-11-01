import { cosine, MIN_SCORE, modelTag, rank } from '@/src/ai/embed';
import * as models from '@/src/ai/models';
import { afterGhostify, reindex, searchSemantic } from '@/src/background/jobs';
import { db } from '@/src/store/db';
import { ghostify, setState } from '@/src/store/items';
import { DEFAULT_SETTINGS, saveSettings, withDefaults } from '@/src/store/settings';
import { embedModel, textModel } from './mock-model';

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
const tag = modelTag(DEFAULT_SETTINGS.ai.embedding);

beforeEach(async () => {
  await db.items.clear();
  await db.embeddings.clear();
  vi.spyOn(models, 'embeddingModel').mockReturnValue(embedModel(vec));
  vi.spyOn(models, 'languageModel').mockReturnValue(textModel('{"summary":"s","tags":[]}'));
});
afterEach(() => vi.restoreAllMocks());
const aiOn = () => saveSettings(withDefaults({ ai: { ...DEFAULT_SETTINGS.ai, enabled: true } }));

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
});
