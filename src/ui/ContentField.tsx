import {
  describeFeed,
  type FeedContent,
  type FeedContentType,
  type FeedDescriptor,
  FIELD_NAMES,
  type FieldName,
} from 'feedgrab';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { typeLabel } from './grab/bits';
import { KIND_INFO, KINDS } from './kinds';
import { btnQuiet, field } from './kit';

const LABEL: Record<FieldName, string> = {
  title: 'Title',
  text: 'Text',
  html: 'Content HTML',
  author: 'Author',
  publishedAt: 'Date',
  image: 'Image',
  mediaUrl: 'Media file',
  embedUrl: 'Player',
  poster: 'Poster',
  duration: 'Length',
};

/**
 * A feed's content in Settings → Sites: its type (detected unless set) and field rules, each
 * checked against the saved sample (feedgrab `describeFeed`).
 */
export function ContentField(props: {
  content?: FeedContent;
  /** The edited feed, and the parsed sample it is checked against (when there is one). */
  descriptor: FeedDescriptor;
  sample?: { doc: Document; url: string };
  onChange(c?: FeedContent): void;
}) {
  const { content, onChange } = props;
  const described = useMemo(() => {
    if (!props.sample) return undefined;
    try {
      return describeFeed(props.sample.doc, props.descriptor, { baseUrl: props.sample.url });
    } catch {
      return undefined;
    }
  }, [props.sample, props.descriptor]);
  const fields = content?.fields ?? {};
  const names = Object.keys(fields) as FieldName[];
  const setFields = (next: FeedContent['fields']) => {
    const has = next && Object.keys(next).length > 0;
    if (!has && (!content || content.type === 'mixed')) return onChange(undefined);
    onChange({ type: content?.type ?? 'mixed', ...(has && { fields: next }) });
  };
  const free = FIELD_NAMES.filter((n) => !names.includes(n));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="sr-only">Content</legend>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Holds</span>
        <select
          aria-label="Content type"
          value={content?.type && !(content.type === 'mixed' && names.length) ? content.type : ''}
          onChange={(e) => {
            const type = e.target.value as FeedContentType | '';
            if (type) onChange({ type, ...(names.length && { fields }) });
            else setFields(content?.fields);
          }}
          className={`${field} text-xs`}
        >
          <option value="">
            {described ? `${typeLabel(described.detected)} (detected)` : 'Detected per item'}
          </option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].plural}
            </option>
          ))}
          <option value="mixed">Mixed</option>
        </select>
      </label>
      {names.map((n) => {
        const rule = fields[n];
        if (!rule) return null;
        const f = described?.fields.find((x) => x.field === n);
        return (
          <span key={n} className="flex items-center gap-1.5 text-xs">
            <span className="w-20 shrink-0 text-zinc-500">{LABEL[n]}</span>
            <input
              aria-label={`${LABEL[n]} selector`}
              value={rule.selector.value}
              spellCheck={false}
              onChange={(e) =>
                setFields({
                  ...fields,
                  [n]: { ...rule, selector: { ...rule.selector, value: e.target.value } },
                })
              }
              className={`${field} min-w-0 flex-1 font-mono text-xs`}
            />
            {f && (
              <span className="shrink-0 tabular-nums text-zinc-500" title={f.value}>
                {Math.round(f.coverage * 100)}%
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${LABEL[n]} rule`}
              className={btnQuiet}
              onClick={() => {
                const { [n]: _, ...rest } = fields;
                setFields(rest);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        );
      })}
      {free.length > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Plus className="size-3.5" />
          <select
            aria-label="Add a field rule"
            value=""
            onChange={(e) => {
              const n = e.target.value as FieldName;
              if (n) setFields({ ...fields, [n]: { selector: { type: 'css', value: '' } } });
            }}
            className={`${field} text-xs`}
          >
            <option value="">Read an attribute from a selector…</option>
            {free.map((n) => (
              <option key={n} value={n}>
                {LABEL[n]}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}
