import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_PROMPTS, type PromptKey } from '../store/settings';
import { useSettings } from './GeneralSettings';
import { btnQuiet, card, field } from './kit';

const PROMPTS: { key: PromptKey; label: string; hint: string }[] = [
  {
    key: 'enrich',
    label: 'Summary & tags',
    hint: 'System prompt for the one-line summary and tags made after you ghostify (general model). The output format is fixed.',
  },
  {
    key: 'digest',
    label: 'Summarize content',
    hint: 'System prompt for "Summarize" in the viewer (general model, full content when grabbed).',
  },
  {
    key: 'ask',
    label: 'Ask about content',
    hint: 'System prompt for questions in the viewer. The article text and earlier answers are added after it.',
  },
  {
    key: 'rule',
    label: 'Rule question',
    hint: 'The yes/no question System One decision models (d3, Tev1, Jev…) get per auto-ghostify rule. {rule} is replaced by the rule. Chat decision models use feedgrab’s built-in prompt.',
  },
];

function PromptField(props: {
  value: string;
  def: string;
  label: string;
  onSave(v: string): void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const custom = props.value.trim() !== props.def;
  return (
    <>
      <textarea
        aria-label={props.label}
        value={draft}
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== props.value && props.onSave(draft.trim() || props.def)}
        className={`${field} mt-2 w-full resize-y font-mono text-xs leading-relaxed`}
      />
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className={custom ? 'text-ghost-600 dark:text-ghost-300' : 'text-zinc-400'}>
          {custom ? 'Custom' : 'Default'}
        </span>
        {custom && (
          <button
            type="button"
            className={`${btnQuiet} px-2 py-0.5 text-xs`}
            onClick={() => props.onSave(props.def)}
          >
            <RotateCcw className="size-3" /> Reset to default
          </button>
        )}
      </div>
    </>
  );
}

export function PromptSettings() {
  const [settings, update] = useSettings();
  if (!settings) return null;
  const save = (k: PromptKey, v: string) =>
    update({
      ...settings,
      ai: { ...settings.ai, prompts: { ...settings.ai.prompts, [k]: v } },
    });
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        Change how Ghostify asks the AI. Changes apply to the next request; saved when you leave a
        field. Changing the rule question re-checks items against your rules.
      </p>
      {PROMPTS.map((p) => (
        <div key={p.key} className={card}>
          <div className="font-medium">{p.label}</div>
          <div className="text-xs text-zinc-500">{p.hint}</div>
          <PromptField
            label={`${p.label} prompt`}
            value={settings.ai.prompts[p.key]}
            def={DEFAULT_PROMPTS[p.key]}
            onSave={(v) => save(p.key, v)}
          />
        </div>
      ))}
    </section>
  );
}
