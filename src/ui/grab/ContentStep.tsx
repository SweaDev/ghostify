import type { ContentKind, FeedContentType, FieldName, FieldRule } from 'feedgrab';
import { ChevronLeft, ChevronRight, Crosshair, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { FieldRow, GrabCommand, GrabContent, GrabState } from '../../grab/protocol';
import { duration } from '../format';
import { GhostIcon } from '../GhostIcon';
import { KIND_INFO, KINDS } from '../kinds';
import { btnQuiet, field } from '../kit';
import { Advanced, Coverage, SelectorInput, TypeBadge, typeLabel } from './bits';

const FIELD_LABEL: Record<FieldName, string> = {
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

/** The attributes that matter for each kind, in the order they're shown. */
const KIND_FIELDS: Record<ContentKind, FieldName[]> = {
  post: ['title', 'text', 'author', 'publishedAt', 'image'],
  image: ['image', 'title', 'author', 'publishedAt'],
  video: ['title', 'poster', 'embedUrl', 'mediaUrl', 'duration', 'author', 'publishedAt'],
  audio: ['title', 'mediaUrl', 'embedUrl', 'duration', 'author', 'publishedAt'],
  pdf: ['title', 'mediaUrl', 'author', 'publishedAt'],
};

const shown = (type: FeedContentType, preview?: ContentKind) =>
  KIND_FIELDS[type === 'mixed' ? (preview ?? 'post') : type];

function show(row: FieldRow): string {
  if (!row.value) return '—';
  if (row.field === 'duration') return duration(Number(row.value));
  if (row.field === 'publishedAt') return new Date(row.value).toLocaleDateString();
  return row.value;
}

function PreviewCard({ c }: { c: GrabContent }) {
  const p = c.preview;
  if (!p) return null;
  const kind = p.kind !== 'post' ? KIND_INFO[p.kind] : undefined;
  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-ghost-100 to-ghost-200 dark:from-ghost-900 dark:to-zinc-800">
        {p.image ? (
          <img src={p.image} alt="" className="size-full object-cover" />
        ) : (
          <GhostIcon className="size-full p-2.5" />
        )}
        {(kind || p.duration) && (
          <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded bg-zinc-900/75 px-1 text-[10px] text-white">
            {kind && <kind.Icon className="size-3" />}
            {p.duration ? duration(p.duration) : null}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-medium text-sm leading-snug">{p.title}</div>
        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[p.author, p.provider, p.publishedAt && new Date(p.publishedAt).toLocaleDateString()]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {p.excerpt && (
          <div className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
            {p.excerpt}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLine(props: {
  row: FieldRow;
  total: number;
  picking: boolean;
  send(c: GrabCommand): void;
}) {
  const { row, send } = props;
  return (
    <li
      className="flex items-center gap-2 py-1.5"
      onMouseEnter={() => send({ type: 'highlightField', field: row.field })}
      onMouseLeave={() => send({ type: 'highlightField', field: null })}
    >
      <span className="w-16 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
        {FIELD_LABEL[row.field]}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" title={row.value}>
        {show(row)}
      </span>
      <Coverage share={row.coverage} total={props.total} />
      {row.rule && (
        <button
          type="button"
          title="Back to automatic"
          aria-label={`Reset ${FIELD_LABEL[row.field]}`}
          className={btnQuiet}
          onClick={() => send({ type: 'setField', field: row.field, rule: null })}
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        title={`Pick the ${FIELD_LABEL[row.field].toLowerCase()} in the sample item`}
        aria-label={`Pick ${FIELD_LABEL[row.field]}`}
        disabled={props.picking}
        className={btnQuiet}
        onClick={() => send({ type: 'pickField', field: row.field })}
      >
        <Crosshair className="size-3.5" />
      </button>
    </li>
  );
}

function FieldRuleEditor({ row, send }: { row: FieldRow; send(c: GrabCommand): void }) {
  const rule = row.rule;
  const set = (next: FieldRule | null) => send({ type: 'setField', field: row.field, rule: next });
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{FIELD_LABEL[row.field]}</span>
        {row.candidates.length > 0 && (
          <select
            aria-label={`${FIELD_LABEL[row.field]} suggestions`}
            value=""
            onChange={(e) => {
              const c = row.candidates[Number(e.target.value)];
              if (c) set(c.rule);
            }}
            className={`${field} ml-auto max-w-48 text-xs`}
          >
            <option value="">Suggestions…</option>
            {row.candidates.map((c, i) => (
              <option key={c.rule.selector.value} value={i}>
                {c.rule.selector.value} · {Math.round(c.coverage * 100)}%
              </option>
            ))}
          </select>
        )}
      </div>
      <SelectorInput
        label="Selector (relative to the item; empty = automatic)"
        value={rule?.selector ?? { type: 'css', value: '' }}
        onApply={(selector) => set(selector.value.trim() ? { ...rule, selector } : null)}
      />
      {rule && (
        <span className="flex gap-1 text-xs">
          <select
            aria-label={`${FIELD_LABEL[row.field]} source`}
            value={rule.source ?? ''}
            onChange={(e) => {
              const source = (e.target.value || undefined) as FieldRule['source'];
              const { source: _, attr: __, ...rest } = rule;
              set({
                ...rest,
                ...(source && { source }),
                ...(source === 'attr' && rule.attr && { attr: rule.attr }),
              });
            }}
            className={`${field} text-xs`}
          >
            <option value="">Default</option>
            <option value="text">Text</option>
            <option value="html">HTML</option>
            <option value="attr">Attribute</option>
          </select>
          {rule.source === 'attr' && (
            <input
              aria-label={`${FIELD_LABEL[row.field]} attribute`}
              defaultValue={rule.attr ?? ''}
              placeholder="src, href, datetime…"
              onBlur={(e) => set({ ...rule, attr: e.target.value.trim() || undefined })}
              className={`${field} min-w-0 flex-1 font-mono text-xs`}
            />
          )}
        </span>
      )}
    </div>
  );
}

/** Step 2: what the feed holds and where each attribute is read from, on a sample item. */
export function ContentStep({ state, send }: { state: GrabState; send(c: GrabCommand): void }) {
  const c = state.content;
  const accepted = state.feeds.filter((f) => f.accepted);
  if (!c) return <p className="text-sm text-zinc-500">Reading the feed…</p>;
  const fields = shown(c.type, c.preview?.kind);
  const rows = fields
    .map((f) => c.fields.find((r) => r.field === f))
    .filter((r): r is FieldRow => !!r);
  const extra = c.fields.filter((r) => !fields.includes(r.field));
  return (
    <div className="flex flex-col gap-3">
      {accepted.length > 1 && (
        <div role="tablist" className="flex gap-1">
          {accepted.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === c.feedId}
              onClick={() => send({ type: 'select', id: f.id })}
              className={`rounded-lg px-2.5 py-1 text-xs ${f.id === c.feedId ? 'bg-ghost-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
            >
              Feed {state.feeds.indexOf(f) + 1}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">This feed holds</span>
        <select
          aria-label="Content type"
          value={c.declared ? c.type : ''}
          onChange={(e) =>
            send({
              type: 'setType',
              contentType: (e.target.value || null) as FeedContentType | null,
            })
          }
          className={`${field} text-xs`}
        >
          <option value="">{typeLabel(c.detected)} (detected)</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].plural}
            </option>
          ))}
          <option value="mixed">Mixed</option>
        </select>
        <TypeBadge type={c.type} />
      </label>
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          aria-label="Previous sample item"
          className={btnQuiet}
          disabled={c.reference <= 0}
          onClick={() => send({ type: 'reference', index: c.reference - 1 })}
        >
          <ChevronLeft className="size-4" />
        </button>
        Sample item {c.reference + 1} of {c.items}
        <button
          type="button"
          aria-label="Next sample item"
          className={btnQuiet}
          disabled={c.reference >= c.items - 1}
          onClick={() => send({ type: 'reference', index: c.reference + 1 })}
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="ml-auto">Pick a typical one, not an ad</span>
      </div>
      <PreviewCard c={c} />
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((r) => (
          <FieldLine key={r.field} row={r} total={c.items} picking={!!state.picking} send={send} />
        ))}
      </ul>
      <Advanced id="content">
        {[...rows, ...extra].map((r) => (
          <FieldRuleEditor key={r.field} row={r} send={send} />
        ))}
        <div className="flex flex-col gap-1.5 text-xs">
          <span className="font-medium">Post link</span>
          <select
            aria-label="Post link"
            value={String(c.link.selected)}
            onChange={(e) => {
              const i = Number(e.target.value);
              if (i === -1) send({ type: 'setLink', selector: null });
              else if (i >= 0 && c.link.options[i])
                send({ type: 'setLink', selector: c.link.options[i].selector });
            }}
            className={`${field} text-xs`}
          >
            <option value="-1">Automatic</option>
            {c.link.options.map((o, i) => (
              <option key={o.selector.value} value={i}>
                {o.label}
              </option>
            ))}
            {c.link.selected === -2 && <option value="-2">Custom</option>}
          </select>
          <SelectorInput
            label="Custom link selector"
            value={c.link.selector}
            onApply={(sel) => send({ type: 'setLink', selector: sel.value.trim() ? sel : null })}
          />
          <span className="truncate text-zinc-500">
            Opens: {c.link.opens ?? 'no link'} · found in {c.link.found} of {c.items}
          </span>
          {c.link.params.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-zinc-500">Query parameters that identify a post</span>
              {c.link.params.map((p) => (
                <label key={p.name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={p.kept}
                    onChange={(e) =>
                      send({ type: 'setParam', name: p.name, kept: e.target.checked })
                    }
                    className="accent-ghost-500"
                  />
                  <code>{p.name}</code>
                  <span className="truncate text-zinc-500">{p.note}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 text-zinc-500">
                <input
                  type="checkbox"
                  checked={c.link.own}
                  onChange={(e) => send({ type: 'ownParams', own: e.target.checked })}
                  className="accent-ghost-500"
                />
                Only this feed (otherwise unticked ones are ignored on the whole site)
              </label>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          <span className="flex items-center font-medium">
            Item structure
            <span className="ml-2 font-normal text-zinc-500">
              {c.matching} of {c.items} items have every required part
            </span>
            <button
              type="button"
              className={`${btnQuiet} ml-auto`}
              onClick={() => send({ type: 'suggestParts' })}
            >
              <Sparkles className="size-3.5" /> Suggest again
            </button>
          </span>
          {c.parts.map((p, i) => (
            <span key={p.selector.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.required}
                aria-label={`Required: ${p.label ?? p.selector.value}`}
                onChange={(e) => send({ type: 'setPart', index: i, required: e.target.checked })}
                className="accent-ghost-500"
              />
              <code className="min-w-0 flex-1 truncate" title={p.selector.value}>
                {p.label ? `${p.label} · ` : ''}
                {p.selector.value}
              </code>
              <span className="text-zinc-500 tabular-nums">
                {p.count}/{c.items}
              </span>
              <button
                type="button"
                aria-label="Remove part"
                className={btnQuiet}
                onClick={() => send({ type: 'removePart', index: i })}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
          <span className="text-zinc-500">
            The ghost button only shows on items with every required part, so ads and headings are
            skipped.
          </span>
        </div>
      </Advanced>
    </div>
  );
}
