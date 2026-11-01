import { embed, generateText } from 'ai';
import { getKeys } from '../store/secrets';
import { getSettings, type Purpose } from '../store/settings';
import { embeddingModel, hasModel, languageModel, ollamaStatus } from './models';

export interface CheckResult {
  ok: boolean;
  message: string;
}

/** Makes one tiny call with the model configured for a purpose. */
export async function checkPurpose(purpose: Purpose): Promise<CheckResult> {
  const [settings, keys] = await Promise.all([getSettings(), getKeys()]);
  const ref = settings.ai[purpose];
  try {
    if (ref.provider === 'ollama') {
      const st = await ollamaStatus(settings.ai.ollamaBaseUrl);
      if (!st.ok) return { ok: false, message: st.error ?? 'Ollama is not reachable' };
      if (!hasModel(st.models, ref.model))
        return { ok: false, message: `Model not pulled: run "ollama pull ${ref.model}"` };
      if (purpose === 'decision' && ref.model.startsWith('d3'))
        return { ok: true, message: `${ref.model} is installed` };
    }
    if (purpose === 'embedding') {
      const { embedding } = await embed({
        model: embeddingModel(ref, settings, keys),
        value: 'ghost',
      });
      return { ok: true, message: `Embeddings work (${embedding.length} dimensions)` };
    }
    const { text } = await generateText({
      model: languageModel(ref, settings, keys),
      prompt: 'Reply with the single word OK.',
      maxOutputTokens: 16,
    });
    return { ok: true, message: `Model replied: ${text.trim().slice(0, 40) || '(empty)'}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
