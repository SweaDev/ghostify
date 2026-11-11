import type { FeedDescriptor } from 'feedgrab';
import { useEffect, useMemo, useState } from 'react';
import { extractItem } from '../feed/extract';
import { checkFeed, samePostLink } from '../sites/links';
import { defaultReference, hasRequired, offStructure, sameStructure } from '../sites/structure';
import type { SampleRow } from '../store/db';
import { getSamples } from '../store/samples';

export interface Sample {
  row: SampleRow;
  /** Inert parsed copy (never attached to the page). */
  doc: Document;
}

/** The saved samples of a site by feed id (undefined while loading). */
export function useSamples(siteId: string): Map<string, Sample> | undefined {
  const [rows, setRows] = useState<SampleRow[]>();
  useEffect(() => {
    let live = true;
    getSamples(siteId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [siteId]);
  return useMemo(() => {
    if (!rows) return undefined;
    const parser = new DOMParser();
    return new Map(
      rows.map((row) => [row.feedId, { row, doc: parser.parseFromString(row.html, 'text/html') }]),
    );
  }, [rows]);
}

const tone = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  muted: 'text-zinc-500',
};

function Line(props: { kind: keyof typeof tone; children: React.ReactNode }) {
  const pad = props.kind === 'warn' ? 'rounded-md px-2 py-1' : '';
  return <p className={`text-xs ${pad} ${tone[props.kind]}`}>{props.children}</p>;
}

/**
 * Checks a feed's edited selectors against its saved sample. Never blocks saving: when the
 * sample can't confirm the edit it only says so.
 */
export function SampleStatus(props: {
  sample?: Sample;
  saved: FeedDescriptor;
  draft: FeedDescriptor;
  host: string;
}) {
  const { sample, saved, draft, host } = props;
  if (!sample)
    return (
      <Line kind="muted">
        No sample of this feed is saved yet, so edits can't be checked here. Ghostify saves one the
        next time you open the page.
      </Line>
    );
  const { row, doc } = sample;
  const date = new Date(row.capturedAt).toLocaleDateString();
  const total = checkFeed(doc, saved, row.url).items.length;
  const check = checkFeed(doc, draft, row.url);
  const n = check.items.length;
  const changedLink = !samePostLink(saved, draft);
  // The sample post: the one most like the structure (the post chosen in the picker), else the first.
  const posts = check.items.map((i) => i.element);
  const first = check.items[defaultReference(posts, draft.structure)];
  const title =
    first &&
    extractItem(first, { host, siteId: '', view: 'any', baseUrl: row.url }).title.slice(0, 80);
  const shaped = hasRequired(draft.structure);
  const fit = check.items.filter((i) => !offStructure(i)).length;
  return (
    <div className="flex flex-col gap-1" role="status">
      {n === 0 ? (
        <Line kind="warn">
          Can't verify against the saved sample (from {date}): these selectors find no posts in it.
          That's expected if the site changed its layout; otherwise check the selectors.
        </Line>
      ) : (
        <Line kind={n < total ? 'warn' : 'ok'}>
          Sample from {date}: finds {n} of {Math.max(total, n)} posts. Sample post: “{title}” →{' '}
          <span className="break-all font-mono">{first?.permalink ?? 'no link'}</span>
        </Line>
      )}
      {n > 0 && shaped && (
        <Line kind={fit === 0 ? 'warn' : 'ok'}>
          {fit === 0
            ? 'No sample post has every required part, so the button would show nowhere. Make some parts optional.'
            : `${fit} of ${n} sample posts have every required part and get the button.`}
        </Line>
      )}
      {n > 0 && !shaped && !sameStructure(saved.structure, draft.structure) && (
        <Line kind="muted">No part is required, so every item gets the button.</Line>
      )}
      {n > 0 && draft.permalink && check.linkHits === 0 && (
        <Line kind="warn">
          The post link selector finds no link in the sample, so the automatic link is used.
        </Line>
      )}
      {changedLink && (
        <Line kind="muted">
          Changing the post link changes how Ghostify recognises posts on this page, so posts
          ghostified here before may show again.
        </Line>
      )}
    </div>
  );
}
