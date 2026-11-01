import { enrichItem, itemText, normalizeTags } from '@/src/ai/enrich';
import * as models from '@/src/ai/models';
import { afterGhostify } from '@/src/background/jobs';
import { db } from '@/src/store/db';
import { getItem, ghostify } from '@/src/store/items';
import { saveSettings, withDefaults } from '@/src/store/settings';
import { embedModel, textModel } from './mock-model';

const draft = {
  id: 'a',
  host: 'dev.to',
  siteId: 'devto',
  view: 'any' as const,
  title: 'Rust tips',
  excerpt: 'Ownership',
};
const answer = JSON.stringify({
  summary: ' Tips about Rust ownership. ',
  tags: ['#Rust', 'rust', 'Memory Safety', ''],
});

beforeEach(() => db.items.clear());
afterEach(() => vi.restoreAllMocks());

describe('enrich', () => {
  it('normalizes tags and builds the prompt text', () => {
    expect(normalizeTags(['#Rust', 'rust', '  Web   Dev ', 'a', 'b', 'c', 'd'])).toEqual([
      'rust',
      'web dev',
      'a',
      'b',
      'c',
    ]);
    expect(itemText({ ...draft, author: 'Ann' })).toContain('Author: Ann');
  });

  it('returns a summary and tags from the model', async () => {
    const item = await ghostify(draft);
    expect(await enrichItem(item, textModel(answer))).toEqual({
      summary: 'Tips about Rust ownership.',
      tags: ['rust', 'memory safety'],
    });
  });

  it('runs after ghostify only when AI is on', async () => {
    const spy = vi.spyOn(models, 'languageModel').mockReturnValue(textModel(answer));
    vi.spyOn(models, 'embeddingModel').mockReturnValue(embedModel(() => [1, 0]));
    const item = await ghostify(draft);
    await afterGhostify(item.key);
    expect(spy).not.toHaveBeenCalled();

    await saveSettings(withDefaults({ ai: { ...withDefaults({}).ai, enabled: true } }));
    await afterGhostify(item.key);
    expect(await getItem(item.key)).toMatchObject({
      summary: 'Tips about Rust ownership.',
      tags: ['rust', 'memory safety'],
    });
  });
});
