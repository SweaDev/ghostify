import { type LanguageModel, type ModelMessage, streamText } from 'ai';
import type { QaEntry } from '../store/db';

/** Small local models have small contexts; long articles are cut to this many characters. */
export const MAX_CONTENT = 24_000;

export function contentText(c: { title: string; byline?: string; text: string }): string {
  const head = [`Title: ${c.title}`, c.byline && `By: ${c.byline}`].filter(Boolean).join('\n');
  const body = c.text.length > MAX_CONTENT ? `${c.text.slice(0, MAX_CONTENT)}…` : c.text;
  return `${head}\n\n${body}`;
}

export interface StreamOpts {
  model: LanguageModel;
  system: string;
  signal?: AbortSignal;
  /** Called with the text so far as it streams. */
  onText?(text: string): void;
}

async function run(opts: StreamOpts, messages: ModelMessage[]): Promise<string> {
  const res = streamText({
    model: opts.model,
    system: opts.system,
    messages,
    abortSignal: opts.signal,
    onError: () => {},
  });
  let text = '';
  for await (const delta of res.textStream) {
    text += delta;
    opts.onText?.(text);
  }
  // Surfaces model errors that ended the stream early.
  await res.finishReason;
  return text.trim();
}

/** A short digest of the full content. */
export const digestContent = (content: string, opts: StreamOpts) =>
  run(opts, [{ role: 'user', content }]);

/** Answers `question` about the content; earlier answered questions are kept as context. */
export function askContent(
  content: string,
  history: Pick<QaEntry, 'q' | 'a'>[],
  question: string,
  opts: StreamOpts,
): Promise<string> {
  const messages: ModelMessage[] = [{ role: 'user', content: `Article:\n${content}` }];
  messages.push({ role: 'assistant', content: 'I have read the article. What is your question?' });
  for (const h of history.filter((h) => h.a)) {
    messages.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
  }
  messages.push({ role: 'user', content: question });
  return run(opts, messages);
}
