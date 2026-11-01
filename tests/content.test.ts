import { noulQuestions } from '@/src/ai/decision';
import * as models from '@/src/ai/models';
import { ask, digest, enrich, forget } from '@/src/background/jobs';
import { db } from '@/src/store/db';
import { ghostify } from '@/src/store/items';
import { DEFAULT_PROMPTS, getSettings, saveSettings, withDefaults } from '@/src/store/settings';
import { streamModel, textModel } from './mock-model';

const draft = {
  id: 'a',
  host: 'blog.test',
  siteId: 's',
  view: 'any' as const,
  title: 'Rust tips',
  excerpt: 'Ownership',
  url: 'https://blog.test/rust',
};

const aiOn = async (prompts = {}) => {
  const s = await getSettings();
  await saveSettings(
    withDefaults({ ai: { ...s.ai, enabled: true, prompts: { ...s.ai.prompts, ...prompts } } }),
  );
};
const until = (fn: () => Promise<unknown>) =>
  vi.waitFor(async () => expect(await fn()).toBeTruthy());

beforeEach(async () => {
  await Promise.all([db.items.clear(), db.contents.clear(), db.aiJobs.clear()]);
  await saveSettings(withDefaults({}));
});
afterEach(() => vi.restoreAllMocks());

describe('content AI', () => {
  it('streams a digest of the grabbed content with the custom prompt', async () => {
    const item = await ghostify(draft);
    await db.contents.put({
      key: item.key,
      url: draft.url,
      title: 'Rust tips',
      html: '',
      text: 'Ownership is the core.',
      fetchedAt: 1,
    });
    await aiOn({ digest: 'Be brief.' });
    const seen: unknown[] = [];
    vi.spyOn(models, 'languageModel').mockReturnValue(
      streamModel((p) => {
        seen.push(p);
        return ['It is ', 'about Rust.'];
      }),
    );
    await digest(item.key);
    await until(async () => (await db.contents.get(item.key))?.digestAt);
    expect((await db.contents.get(item.key))?.digest).toBe('It is about Rust.');
    expect(JSON.stringify(seen)).toContain('Be brief.');
    expect(JSON.stringify(seen)).toContain('Ownership is the core.');
    await until(async () =>
      (await db.aiJobs.toArray()).find((j) => j.kind === 'digest' && j.status === 'done'),
    );
  });

  it('answers questions in a thread, with earlier answers as context', async () => {
    const item = await ghostify(draft);
    await aiOn();
    const seen: string[] = [];
    vi.spyOn(models, 'languageModel').mockReturnValue(
      streamModel((p) => {
        seen.push(JSON.stringify(p));
        return [`answer ${seen.length}`];
      }),
    );
    await ask(item.key, 'What is it about?');
    await until(async () => (await db.contents.get(item.key))?.qa?.[0]?.a);
    const id = await ask(item.key, 'And then?');
    await until(async () => (await db.contents.get(item.key))?.qa?.[1]?.a);
    expect((await db.contents.get(item.key))?.qa?.map((q) => [q.q, q.a])).toEqual([
      ['What is it about?', 'answer 1'],
      ['And then?', 'answer 2'],
    ]);
    expect(seen[1]).toContain('answer 1'); // history
    expect(seen[0]).toContain('Ownership'); // feed text when nothing was grabbed
    await forget(item.key, id);
    expect((await db.contents.get(item.key))?.qa).toHaveLength(1);
  });

  it('records failures on the entry', async () => {
    const item = await ghostify(draft);
    await aiOn();
    vi.spyOn(models, 'languageModel').mockImplementation(() => {
      throw new Error('no key');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ask(item.key, 'Why?');
    await until(async () => (await db.contents.get(item.key))?.qa?.[0]?.error);
    expect((await db.contents.get(item.key))?.qa?.[0]?.error).toBe('no key');
  });

  it('refuses while AI is off', async () => {
    const item = await ghostify(draft);
    await expect(digest(item.key)).rejects.toThrow('Turn on AI');
  });
});

describe('custom prompts', () => {
  it('uses the enrich prompt and the rule question template', async () => {
    const item = await ghostify(draft);
    await aiOn({ enrich: 'Tag it.' });
    const model = textModel(JSON.stringify({ summary: 's', tags: ['t'] }));
    vi.spyOn(models, 'languageModel').mockReturnValue(model);
    await enrich(item.key);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('Tag it.');

    expect(noulQuestions(['ads']).c0?.instructions).toBe(
      DEFAULT_PROMPTS.rule.replace('{rule}', 'ads'),
    );
    expect(noulQuestions(['ads'], 'Is it {rule}?').c0?.instructions).toBe('Is it ads?');
    expect(noulQuestions(['ads'], 'Judge it.').c0?.instructions).toBe('Judge it.\nRule: ads');
  });
});
