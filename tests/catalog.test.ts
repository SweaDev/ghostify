import { groupsFor, listModels, type ModelInfo, openaiKinds } from '@/src/ai/catalog';

type Route = (url: string, init?: RequestInit) => unknown;
const fetcherOf = (route: Route) =>
  (async (url: string, init?: RequestInit) =>
    new Response(JSON.stringify(route(url, init)))) as unknown as typeof fetch;
const opts = (route: Route, key = 'k') => ({
  key,
  ollamaBaseUrl: 'http://o',
  fetcher: fetcherOf(route),
});
const byId = (ms: ModelInfo[]) => Object.fromEntries(ms.map((m) => [m.id, m.kinds]));

describe('listModels', () => {
  it('reads Gemini generation methods across pages', async () => {
    const seen: string[] = [];
    const ms = await listModels(
      'gemini',
      opts((url, init) => {
        seen.push(url);
        expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('k');
        return url.includes('pageToken')
          ? {
              models: [
                {
                  name: 'models/gemini-embedding-001',
                  supportedGenerationMethods: ['embedContent'],
                },
              ],
            }
          : {
              models: [
                {
                  name: 'models/gemini-2.5-flash',
                  supportedGenerationMethods: ['generateContent'],
                },
                { name: 'models/imagen-4', supportedGenerationMethods: ['predict'] },
              ],
              nextPageToken: 't',
            };
      }),
    );
    expect(seen).toHaveLength(2);
    expect(byId(ms)).toEqual({
      'gemini-2.5-flash': ['chat'],
      'imagen-4': [],
      'gemini-embedding-001': ['embedding'],
    });
  });

  it('reads OpenRouter output modalities, including decisions', async () => {
    const ms = await listModels(
      'openrouter',
      opts(() => ({
        data: [
          { id: 'a/chat', architecture: { output_modalities: ['text'] } },
          { id: 'a/embed', architecture: { output_modalities: ['embeddings'] } },
          { id: 'a/decide', architecture: { output_modalities: ['decisions'] } },
          { id: 'a/img', architecture: { output_modalities: ['image'] } },
        ],
      })),
    );
    expect(byId(ms)).toEqual({
      'a/chat': ['chat'],
      'a/embed': ['embedding'],
      'a/decide': ['decision'],
      'a/img': [],
    });
  });

  it('reads Ollama capabilities and guesses from names on old servers', async () => {
    const caps: Record<string, string[] | undefined> = {
      'gemma4:e2b': ['completion', 'vision'],
      'embeddinggemma-2:latest': ['embedding'],
      'd3:2b': ['decision'],
      'llama3:latest': undefined,
      'nomic-embed-text:latest': undefined,
    };
    const ms = await listModels(
      'ollama',
      opts((url, init) =>
        url.endsWith('/api/tags')
          ? { models: Object.keys(caps).map((name) => ({ name })) }
          : { capabilities: caps[JSON.parse(String(init?.body)).model] },
      ),
    );
    expect(byId(ms)).toEqual({
      'gemma4:e2b': ['chat'],
      'embeddinggemma-2:latest': ['embedding'],
      'd3:2b': ['decision'],
      'llama3:latest': ['chat'],
      'nomic-embed-text:latest': ['embedding'],
    });
  });

  it('classifies OpenAI ids and reports HTTP errors', async () => {
    expect(openaiKinds('text-embedding-3-small')).toEqual(['embedding']);
    expect(openaiKinds('gpt-5-mini')).toEqual(['chat']);
    expect(openaiKinds('o4-mini')).toEqual(['chat']);
    expect(openaiKinds('gpt-4o-mini-tts')).toEqual([]);
    expect(openaiKinds('dall-e-3')).toEqual([]);
    const bad = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(listModels('openai', { ollamaBaseUrl: '', fetcher: bad })).rejects.toThrow(/401/);
  });
});

describe('groupsFor', () => {
  const ms: ModelInfo[] = [
    { id: 'b-chat', kinds: ['chat'] },
    { id: 'a-chat', kinds: ['chat'] },
    { id: 'emb', kinds: ['embedding'] },
    { id: 'dec', kinds: ['decision', 'chat'] },
  ];

  it('lists decision models first, then the other chat models', () => {
    expect(groupsFor('decision', ms)).toEqual([
      { label: 'Decision models', models: ['dec'] },
      { label: 'Chat models', models: ['a-chat', 'b-chat'] },
    ]);
    expect(groupsFor('embedding', ms)).toEqual([{ label: 'Embedding models', models: ['emb'] }]);
  });

  it('falls back to chat models when a provider has no decision model', () => {
    const plain = ms.filter((m) => m.id !== 'dec');
    expect(groupsFor('decision', plain)).toEqual([
      { label: 'Chat models', models: ['a-chat', 'b-chat'] },
    ]);
  });
});
