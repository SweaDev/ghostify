import { FileText, Loader2, Send, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '../messaging';
import type { GhostItem, QaEntry } from '../store/db';
import { JobControls } from './AiActivity';
import { btn, btnPrimary, card, field } from './kit';
import { busy, useAiPaused, useJob } from './useAi';
import type { Grab } from './useContent';

const SUGGESTIONS = [
  'What are the key takeaways?',
  'Is it worth my time? Why?',
  'Explain it to a beginner.',
  'What should I do differently after reading it?',
];

function JobState(props: { id?: string }) {
  const job = useJob(props.id);
  if (!job || !busy(job)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      {job.status === 'running' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <span className="rounded-full bg-amber-100 px-1.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {job.status}
        </span>
      )}
      <JobControls job={job} />
    </span>
  );
}

function Answer(props: { itemKey: string; qa: QaEntry }) {
  const { qa } = props;
  const job = useJob(qa.jobId);
  const waiting = busy(job) && !qa.a;
  return (
    <li className="flex flex-col gap-2">
      <div className="group flex items-start gap-2 self-end">
        <button
          type="button"
          title="Remove"
          aria-label="Remove question"
          onClick={() => void sendMessage('forget', { key: props.itemKey, qaId: qa.id })}
          className="mt-1.5 rounded p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" />
        </button>
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ghost-500 px-3 py-2 text-sm text-white">
          {qa.q}
        </div>
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
        {waiting ? (
          <span className="text-zinc-500">Thinking…</span>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{qa.a || (qa.error ? '' : '—')}</p>
        )}
        {qa.error && <p className="text-rose-600 text-xs dark:text-rose-400">{qa.error}</p>}
        {job?.status === 'stopped' && !qa.error && (
          <p className="text-xs text-zinc-500">Stopped.</p>
        )}
        <div className="mt-1 flex justify-end">
          <JobState id={qa.jobId} />
        </div>
      </div>
    </li>
  );
}

/** Summarize the item's content and ask the AI about it. */
export function AskPanel(props: { item: GhostItem; grab: Grab; aiEnabled: boolean }) {
  const { item, grab, aiEnabled } = props;
  const c = grab.content;
  const [question, setQuestion] = useState('');
  const paused = useAiPaused();
  const digestJob = useJob(c?.digestJob);
  const digesting = busy(digestJob);

  if (!aiEnabled) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Sparkles className="size-8 text-ghost-400" />
        <p className="max-w-sm text-sm text-zinc-500">
          Turn on AI in Settings to summarize this item and ask questions about it. Local models
          with Ollama keep everything on your machine.
        </p>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Open AI settings
        </button>
      </div>
    );
  }

  /** Grabs the full content first when possible; feed text is used otherwise. */
  const withContent = async (run: () => void) => {
    if (!grab.grabbed && item.url) await grab.grab();
    run();
  };
  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion('');
    void withContent(() => void sendMessage('ask', { key: item.key, question: text }));
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      {paused && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:bg-amber-950/40 dark:text-amber-200">
          AI is paused. New requests wait until you resume it from AI activity.
        </p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        <FileText className="size-3.5" />
        {grab.grabbed
          ? `Using the full content (${Math.round((c?.text.length ?? 0) / 1000)}k characters).`
          : item.url
            ? 'The full content is loaded first; if that fails, the feed text is used.'
            : 'Using the text from the feed.'}
        {grab.busy && <Loader2 className="size-3.5 animate-spin" />}
      </p>
      {grab.error && <p className="-mt-3 text-amber-600 text-xs">{grab.error}</p>}

      <section className={card}>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-ghost-500" />
          <h3 className="font-medium text-sm">Summary</h3>
          <span className="ml-auto">
            <JobState id={c?.digestJob} />
          </span>
          {!digesting && (
            <button
              type="button"
              className={c?.digest ? btn : btnPrimary}
              disabled={grab.busy}
              onClick={() => void withContent(() => void sendMessage('digest', { key: item.key }))}
            >
              {c?.digest ? 'Summarize again' : 'Summarize'}
            </button>
          )}
        </div>
        {c?.digest ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.digest}</p>
        ) : (
          <p className="text-sm text-zinc-500">
            {digesting ? 'Writing a summary…' : 'Get the gist before you decide to read it.'}
          </p>
        )}
        {c?.digestError && !digesting && (
          <p className="mt-1 text-rose-600 text-xs dark:text-rose-400">{c.digestError}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium text-sm">Ask about it</h3>
        {!!c?.qa?.length && (
          <ul className="flex flex-col gap-4">
            {c.qa.map((qa) => (
              <Answer key={qa.id} itemKey={item.key} qa={qa} />
            ))}
          </ul>
        )}
        {!c?.qa?.length && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-ghost-300 hover:text-ghost-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-ghost-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <textarea
            aria-label="Your question"
            placeholder="Ask anything about this item…"
            value={question}
            rows={2}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
            className={`${field} min-h-10 flex-1 resize-none`}
          />
          <button
            type="submit"
            aria-label="Ask"
            className={btnPrimary}
            disabled={!question.trim() || grab.busy}
          >
            <Send className="size-4" />
          </button>
        </form>
      </section>
    </div>
  );
}
