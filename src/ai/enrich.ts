import { generateText, type LanguageModel, Output } from 'ai';
import { z } from 'zod';
import type { GhostItem } from '../store/db';
import { DEFAULT_PROMPTS } from '../store/settings';

const EnrichSchema = z.object({
  summary: z.string().describe('One sentence, at most 30 words'),
  tags: z.array(z.string()).describe('1 to 5 short lowercase topic tags'),
});

export interface Enrichment {
  summary: string;
  tags: string[];
}

/** Lowercase, no `#`, single-spaced, unique, at most 5. */
export function normalizeTags(tags: string[]): string[] {
  const out = tags
    .map((t) => t.toLowerCase().replace(/^#+/, '').replace(/\s+/g, ' ').trim())
    .filter((t) => t && t.length <= 30);
  return [...new Set(out)].slice(0, 5);
}

export function itemText(item: Pick<GhostItem, 'title' | 'excerpt' | 'author' | 'host'>): string {
  return [
    `Title: ${item.title}`,
    item.author && `Author: ${item.author}`,
    `Site: ${item.host}`,
    item.excerpt,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

/** One-sentence summary and topic tags for a ghosted item (general model, structured output). */
export async function enrichItem(
  item: GhostItem,
  model: LanguageModel,
  opts: { system?: string; signal?: AbortSignal } = {},
): Promise<Enrichment> {
  const { output } = await generateText({
    model,
    temperature: 0,
    output: Output.object({ schema: EnrichSchema }),
    system: opts.system ?? DEFAULT_PROMPTS.enrich,
    prompt: itemText(item),
    abortSignal: opts.signal,
  });
  return { summary: output.summary.trim(), tags: normalizeTags(output.tags) };
}
