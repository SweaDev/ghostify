import {
  captureSample,
  checkDescriptor,
  createProfile,
  describeFeed,
  detectFeeds,
  detectFromSelector,
  type FeedContentType,
  type FeedDescriptor,
  type FeedItem,
  type FieldName,
  type FieldRule,
  fieldRuleFor,
  generateSelector,
  inspectFromElement,
  partCoverage,
  partText,
  type SiteProfile,
  type StructurePart,
  structureCoverage,
  suggestFields,
} from 'feedgrab';
import type { HighlightEntry } from 'feedgrab/overlay';
import { extractItem } from '../feed/extract';
import { SAMPLE_OPTIONS } from '../feed/samples';
import {
  linkOptions,
  linkParams,
  NO_SELECTOR,
  optionIndex,
  optionLabel,
  paramOptions,
  postLinkOf,
  toggleIgnored,
  toggleParam,
  withIgnore,
  withPostLink,
} from '../sites/links';
import { detectView, type Site, type View } from '../sites/model';
import { existingEntry, findSite, mergePicked } from '../sites/picker';
import { defaultReference, poolAround, startingParts, withStructure } from '../sites/structure';
import type {
  DockPrefs,
  FieldRow,
  GrabCommand,
  GrabContent,
  GrabFeed,
  GrabState,
  PartRow,
} from './protocol';

/** What the session needs from the page and the extension; swapped for fakes in tests. */
export interface SessionDeps {
  doc: Document;
  url: string;
  getSites(): Promise<Site[]>;
  saveSite(site: Site): Promise<void>;
  saveSample(sample: { siteId: string; feedId: string; url: string; html: string }): Promise<void>;
  /** Lets the user click an element on the page; rejects when they cancel. */
  pick(filter: (el: Element) => boolean): Promise<Element>;
  /** Stops a running pick. */
  cancelPick(): void;
  highlight(entries: HighlightEntry[]): void;
  scrollTo(el: Element): void;
  dock: DockPrefs;
  saveDock(prefs: DockPrefs): void;
  popOut(): void;
  /** The session ended (saved or cancelled). */
  close(result: 'saved' | 'cancelled'): void;
}

interface Draft {
  descriptor: FeedDescriptor;
  accepted: boolean;
  reference: number;
  /** Structure suggested once when the content step first shows the feed. */
  shaped?: boolean;
}

const FIELDS: FieldName[] = [
  'title',
  'text',
  'author',
  'publishedAt',
  'image',
  'mediaUrl',
  'embedUrl',
  'poster',
  'duration',
];

/** A Grab panel session on one page: feeds, their content and where they apply, until saved. */
export class GrabSession {
  state: GrabState;
  private drafts = new Map<string, Draft>();
  private order: string[] = [];
  private site?: Site;
  private listeners = new Set<(s: GrabState) => void>();

  constructor(private deps: SessionDeps) {
    const u = new URL(deps.url);
    this.state = {
      host: u.hostname,
      url: deps.url,
      editing: false,
      step: 'feeds',
      feeds: [],
      pathPattern: u.pathname || '/',
      view: 'any',
      ignore: [],
      busy: 'Finding feeds…',
      dock: { ...deps.dock, mode: 'docked' },
      imageOrigins: [],
    };
  }

  onChange(cb: (s: GrabState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private emit(patch: Partial<GrabState> = {}): void {
    this.state = { ...this.state, ...patch };
    for (const cb of this.listeners) cb(this.state);
    this.paint();
  }

  /** Detects the page's feeds, seeded with what the site already has for this page and view. */
  async init(): Promise<void> {
    const { doc, url } = this.deps;
    this.site = findSite(await this.deps.getSites(), this.state.host);
    const view: View = this.site ? (detectView(this.site, doc) ?? 'any') : 'any';
    const entry = existingEntry(this.site, url, view) ?? existingEntry(this.site, url, 'any');
    const proposals = await detectFeeds(doc);
    const existing = entry?.profile.feeds ?? [];
    for (const d of existing) this.add(d, true);
    proposals.forEach((d, i) => {
      this.add(d, !existing.length && i === 0);
    });
    this.emit({
      editing: !!entry,
      view: entry?.view ?? view,
      ...(entry && { pathPattern: entry.profile.pathPattern }),
      ...(this.site?.loginIndicator && { indicator: this.site.loginIndicator }),
      ignore: this.site?.ignoreParams ?? [],
      selected: this.order.find((id) => this.drafts.get(id)?.accepted) ?? this.order[0],
      busy: undefined,
      feeds: this.feedRows(),
    });
  }

  private add(d: FeedDescriptor, accepted: boolean): void {
    if (this.drafts.has(d.id)) return;
    const items = this.elements(d);
    this.drafts.set(d.id, {
      descriptor: d,
      accepted,
      reference: defaultReference(items, d.structure),
    });
    this.order.push(d.id);
  }

  private check(d: FeedDescriptor) {
    return checkDescriptor(this.deps.doc, withIgnore(d, this.state.ignore), {
      baseUrl: this.deps.url,
    });
  }

  private elements(d: FeedDescriptor): Element[] {
    return this.check(d).items.map((i) => i.element);
  }

  private feedRows(): GrabFeed[] {
    return this.order.map((id) => {
      const { descriptor: d, accepted } = this.drafts.get(id) as Draft;
      const check = this.check(d);
      return {
        id,
        accepted,
        container: d.container,
        item: d.item,
        items: check.items.length,
        type: d.content?.type ?? check.type,
        detected: check.type,
        confidence: d.confidence,
        source: d.source,
        exclude: d.exclude,
        include: d.include,
      };
    });
  }

  private current(): Draft | undefined {
    return this.state.selected ? this.drafts.get(this.state.selected) : undefined;
  }

  /** Recomputes the feed list and, on the content step, the selected feed's content. */
  private refresh(): void {
    const content = this.state.step === 'content' ? this.contentOf() : undefined;
    this.emit({ feeds: this.feedRows(), content, imageOrigins: this.origins() });
  }

  private contentOf(): GrabContent | undefined {
    const draft = this.current();
    if (!draft) return undefined;
    const base = this.deps.url;
    let d = draft.descriptor;
    const check = this.check(d);
    const items = check.items;
    const els = items.map((i) => i.element);
    const ref = Math.min(Math.max(0, draft.reference), Math.max(0, els.length - 1));
    draft.reference = ref;
    if (!draft.shaped && els.length) {
      draft.shaped = true;
      const parts = startingParts(els, ref, d.structure);
      if (parts.length) {
        d = withStructure(d, { parts });
        draft.descriptor = d;
      }
    }
    const reference = els[ref];
    const pool = poolAround(els, ref);
    const desc = describeFeed(this.deps.doc, withIgnore(d, this.state.ignore), {
      baseUrl: base,
      ...(reference && { reference }),
    });
    const suggested = reference ? suggestFields(pool, { baseUrl: base, reference }) : {};
    const fields: FieldRow[] = FIELDS.map((field) => {
      const f = desc.fields.find((x) => x.field === field);
      const rule = d.content?.fields?.[field];
      return {
        field,
        ...(f?.value !== undefined && { value: f.value }),
        coverage: f?.coverage ?? 0,
        ...(rule && { rule }),
        candidates: suggested[field] ?? [],
      };
    });
    const options = linkOptions(els, ref, base);
    const sel = d.permalink ?? NO_SELECTOR;
    const at = optionIndex(options, sel);
    const parts: PartRow[] = (d.structure?.parts ?? []).map((p) => ({
      selector: p.selector,
      ...(p.label && { label: p.label }),
      required: p.required,
      count: partCoverage(els, p),
      text: reference ? partText(reference, p) : '',
    }));
    return {
      feedId: d.id,
      type: desc.type,
      detected: desc.detected,
      declared: !!d.content?.type,
      kinds: desc.kinds,
      fields,
      items: els.length,
      reference: ref,
      ...(items[ref] && { preview: this.preview(items[ref] as FeedItem) }),
      link: {
        options: options.map((o) => ({ label: optionLabel(o, base), selector: o.selector })),
        selected: sel.value ? (at >= 0 ? at : -2) : -1,
        selector: sel,
        ...(items[ref]?.permalink && { opens: items[ref]?.permalink }),
        found: sel.value ? check.withLink : items.filter((i) => i.permalink).length,
        params: paramOptions(linkParams(items, d, base), d.permalinkParams, this.state.ignore),
        own: !!d.permalinkParams,
      },
      parts,
      matching: structureCoverage(els, d.structure),
    };
  }

  private preview(item: FeedItem) {
    const draft = extractItem(item, {
      host: this.state.host,
      siteId: '',
      view: 'any',
      baseUrl: this.deps.url,
    });
    return {
      kind: draft.kind ?? 'post',
      title: draft.title,
      excerpt: draft.excerpt,
      ...(draft.image && { image: draft.image }),
      ...(draft.author && { author: draft.author }),
      ...(draft.publishedAt && { publishedAt: draft.publishedAt }),
      ...(draft.media?.duration && { duration: draft.media.duration }),
      ...(draft.media?.provider && { provider: draft.media.provider }),
      ...(draft.url && { url: draft.url }),
    };
  }

  /** Image origins of the accepted feeds' first items, for the thumbnail permission. */
  private origins(): string[] {
    const out = new Set<string>();
    for (const id of this.order) {
      const draft = this.drafts.get(id) as Draft;
      if (!draft.accepted) continue;
      for (const item of this.check(draft.descriptor).items.slice(0, 10)) {
        const c = item.content();
        const src = c.media?.poster ?? c.images[0]?.src;
        if (!src) continue;
        try {
          out.add(`${new URL(src).origin}/*`);
        } catch {}
      }
    }
    return [...out].sort();
  }

  /** Outlines accepted feeds, the selected feed's items and the sample item on the page. */
  private paint(field?: FieldName): void {
    const entries: HighlightEntry[] = [];
    const draft = this.current();
    for (const id of this.order) {
      const dr = this.drafts.get(id) as Draft;
      if (!dr.accepted && id !== this.state.selected) continue;
      const items = this.elements(dr.descriptor);
      const first = items[0]?.parentElement;
      if (first)
        entries.push({ el: first, kind: 'feed', label: `Feed ${this.order.indexOf(id) + 1}` });
      if (id !== this.state.selected) continue;
      items.forEach((el, i) => {
        entries.push({
          el,
          kind: i === dr.reference && this.state.step === 'content' ? 'hover' : 'item',
        });
      });
    }
    if (draft && field) {
      const ref = this.elements(draft.descriptor)[draft.reference];
      const rule = draft.descriptor.content?.fields?.[field];
      const sel =
        rule?.selector ??
        this.state.content?.fields.find((f) => f.field === field)?.candidates[0]?.rule.selector;
      if (ref && sel) {
        try {
          const el =
            sel.type === 'css' ? ref.querySelector(sel.value.replace(/^:scope\s*/, '')) : null;
          if (el) entries.push({ el, kind: 'part', label: field });
        } catch {}
      }
    }
    this.deps.highlight(entries);
  }

  private withContent(
    d: FeedDescriptor,
    patch: (c: NonNullable<FeedDescriptor['content']>) => FeedDescriptor['content'],
  ): FeedDescriptor {
    const { content: _, ...rest } = d;
    const next = patch(d.content ?? { type: this.state.content?.detected ?? 'post' });
    return next && (next.type !== undefined || next.fields) ? { ...rest, content: next } : rest;
  }

  /** Runs one panel command. Errors become `state.error` instead of throwing. */
  async run(cmd: GrabCommand): Promise<void> {
    try {
      await this.apply(cmd);
      if (this.state.error) this.emit({ error: undefined });
    } catch (e) {
      this.emit({
        error: e instanceof Error ? e.message : String(e),
        picking: undefined,
        busy: undefined,
      });
    }
  }

  private async apply(cmd: GrabCommand): Promise<void> {
    const draft = this.current();
    switch (cmd.type) {
      case 'select':
        if (!this.drafts.has(cmd.id)) return;
        this.state = { ...this.state, selected: cmd.id };
        return this.refresh();
      case 'toggle': {
        const d = this.drafts.get(cmd.id);
        if (d) d.accepted = !d.accepted;
        return this.refresh();
      }
      case 'show': {
        const d = this.drafts.get(cmd.id);
        const el = d && this.elements(d.descriptor)[0];
        if (el) this.deps.scrollTo(el);
        return;
      }
      case 'inspect': {
        this.emit({ picking: 'feed' });
        const el = await this.deps.pick(() => true);
        const d = inspectFromElement(el);
        this.add(d, true);
        const dr = this.drafts.get(d.id);
        if (dr) dr.accepted = true;
        this.state = { ...this.state, picking: undefined, selected: d.id };
        return this.refresh();
      }
      case 'setSelectors': {
        const old = this.drafts.get(cmd.id);
        if (!old) return;
        const fresh = detectFromSelector(this.deps.doc, {
          container: cmd.container,
          item: cmd.item,
        });
        const { id: _, container: __, item: ___, ...keep } = old.descriptor;
        const d: FeedDescriptor = {
          ...fresh,
          ...keep,
          id: fresh.id,
          container: fresh.container,
          item: fresh.item,
        };
        this.drafts.delete(cmd.id);
        this.order[this.order.indexOf(cmd.id)] = d.id;
        this.drafts.set(d.id, { ...old, descriptor: d, reference: 0 });
        this.state = { ...this.state, selected: d.id };
        return this.refresh();
      }
      case 'addRule': {
        const d = this.drafts.get(cmd.id);
        if (!d || !cmd.selector.value.trim()) return;
        const rule = {
          kind: 'selector' as const,
          selector: cmd.selector,
          scope: 'item' as const,
          origin: 'user' as const,
        };
        d.descriptor = { ...d.descriptor, [cmd.list]: [...d.descriptor[cmd.list], rule] };
        return this.refresh();
      }
      case 'addCriteria': {
        const d = this.drafts.get(cmd.id);
        if (!d || !cmd.criteria.trim()) return;
        d.descriptor = {
          ...d.descriptor,
          exclude: [
            ...d.descriptor.exclude,
            { kind: 'llm-text', criteria: cmd.criteria.trim(), origin: 'user' },
          ],
        };
        return this.refresh();
      }
      case 'removeRule': {
        const d = this.drafts.get(cmd.id);
        if (!d) return;
        const list = d.descriptor[cmd.list].filter((_, i) => i !== cmd.index);
        d.descriptor = { ...d.descriptor, [cmd.list]: list };
        return this.refresh();
      }
      case 'step':
        if (cmd.step !== 'feeds' && !this.order.some((id) => this.drafts.get(id)?.accepted)) {
          throw new Error('Tick at least one feed first.');
        }
        if (cmd.step === 'content' && !this.current()?.accepted) {
          this.state = {
            ...this.state,
            selected: this.order.find((id) => this.drafts.get(id)?.accepted),
          };
        }
        this.state = { ...this.state, step: cmd.step };
        return this.refresh();
      case 'setType':
        if (!draft) return;
        draft.descriptor = this.withContent(draft.descriptor, (c) => {
          if (cmd.contentType) return { ...c, type: cmd.contentType };
          // Back to detected: keep field rules under the detected type, which sets no kind.
          return c.fields ? { type: 'mixed' as FeedContentType, fields: c.fields } : undefined;
        });
        return this.refresh();
      case 'reference':
        if (!draft) return;
        draft.reference = cmd.index;
        return this.refresh();
      case 'pickField': {
        if (!draft) return;
        const items = this.elements(draft.descriptor);
        const ref = items[draft.reference];
        if (!ref) return;
        this.emit({ picking: cmd.field });
        const el = await this.deps.pick((e) => ref.contains(e));
        const c = fieldRuleFor(
          cmd.field,
          el,
          ref,
          poolAround(items, draft.reference),
          this.deps.url,
        );
        this.state = { ...this.state, picking: undefined };
        if (!c) throw new Error(`That element doesn't hold a ${cmd.field}.`);
        return this.apply({ type: 'setField', field: cmd.field, rule: c.rule });
      }
      case 'setField':
        if (!draft) return;
        draft.descriptor = this.withContent(draft.descriptor, (c) => {
          const fields = { ...c.fields };
          if (cmd.rule) fields[cmd.field] = cmd.rule as FieldRule;
          else delete fields[cmd.field];
          const has = Object.keys(fields).length > 0;
          if (!has && c.type === 'mixed' && !this.state.content?.declared) return undefined;
          return has ? { ...c, fields } : { type: c.type };
        });
        return this.refresh();
      case 'highlightField':
        this.paint(cmd.field ?? undefined);
        return;
      case 'setLink':
        if (!draft) return;
        draft.descriptor = withPostLink(draft.descriptor, {
          ...postLinkOf(draft.descriptor),
          selector: cmd.selector ?? NO_SELECTOR,
          params: undefined,
        });
        return this.refresh();
      case 'setParam': {
        if (!draft || !this.state.content) return;
        if (this.state.content.link.own) {
          const params = toggleParam(this.state.content.link.params, cmd.name, cmd.kept);
          draft.descriptor = withPostLink(draft.descriptor, {
            ...postLinkOf(draft.descriptor),
            params,
          });
        } else {
          this.state = {
            ...this.state,
            ignore: toggleIgnored(this.state.ignore, cmd.name, cmd.kept),
          };
        }
        return this.refresh();
      }
      case 'ownParams': {
        if (!draft || !this.state.content) return;
        const params = cmd.own
          ? this.state.content.link.params.filter((p) => p.kept).map((p) => p.name)
          : undefined;
        draft.descriptor = withPostLink(draft.descriptor, {
          ...postLinkOf(draft.descriptor),
          params,
        });
        return this.refresh();
      }
      case 'setPart':
      case 'removePart': {
        if (!draft?.descriptor.structure) return;
        const parts = draft.descriptor.structure.parts.flatMap((p, i): StructurePart[] =>
          i !== cmd.index
            ? [p]
            : cmd.type === 'removePart'
              ? []
              : [{ ...p, required: cmd.required }],
        );
        draft.descriptor = withStructure(draft.descriptor, { parts });
        return this.refresh();
      }
      case 'suggestParts': {
        if (!draft) return;
        const items = this.elements(draft.descriptor);
        draft.descriptor = withStructure(draft.descriptor, {
          parts: startingParts(items, draft.reference),
        });
        return this.refresh();
      }
      case 'setPath':
        this.emit({ pathPattern: cmd.pattern.trim() || '/' });
        return;
      case 'setView':
        this.emit({ view: cmd.view });
        return;
      case 'pickIndicator': {
        this.emit({ picking: 'indicator' });
        const el = await this.deps.pick(() => true);
        const whenPresent = this.state.view === 'loggedOut' ? 'loggedOut' : 'loggedIn';
        this.emit({
          picking: undefined,
          indicator: { selector: generateSelector(el).value, whenPresent },
        });
        return;
      }
      case 'clearIndicator':
        this.emit({ indicator: undefined });
        return;
      case 'cancelPick':
        this.deps.cancelPick();
        this.emit({ picking: undefined });
        return;
      case 'dock':
      case 'resize': {
        const prefs: DockPrefs =
          cmd.type === 'dock'
            ? { side: cmd.side, size: this.state.dock.size }
            : { side: this.state.dock.side, size: Math.round(cmd.size) };
        this.deps.saveDock(prefs);
        this.emit({ dock: { ...this.state.dock, ...prefs } });
        return;
      }
      case 'popOut':
        this.deps.popOut();
        this.emit({ dock: { ...this.state.dock, mode: 'window' } });
        return;
      case 'cancel':
        this.deps.highlight([]);
        this.deps.close('cancelled');
        return;
      case 'save':
        return this.save();
    }
  }

  /** Saves the accepted feeds as this page's profile, plus a sample of each. */
  private async save(): Promise<void> {
    const feeds = this.order
      .map((id) => this.drafts.get(id) as Draft)
      .filter((d) => d.accepted)
      .map((d) => ({ ...d.descriptor, confirmed: true }));
    if (!feeds.length) throw new Error('Tick at least one feed first.');
    this.emit({ busy: 'Saving…' });
    const { doc, url } = this.deps;
    const profile: SiteProfile = {
      ...createProfile({ url, feeds }),
      pathPattern: this.state.pathPattern,
    };
    const title =
      doc.title
        .split(/\s[|–—-]\s/)
        .at(-1)
        ?.trim() ?? this.state.host;
    const indicator = this.state.view === 'any' ? undefined : this.state.indicator;
    const site = mergePicked(await this.deps.getSites(), this.state.host, title, {
      profile,
      view: this.state.view,
      ...(indicator && { indicator }),
      ignoreParams: this.state.ignore,
    });
    await this.deps.saveSite(site);
    for (const f of feeds) {
      const draft = this.drafts.get(f.id) as Draft;
      const reference = this.elements(f)[draft.reference];
      const html = captureSample(doc, withIgnore(f, this.state.ignore), {
        ...SAMPLE_OPTIONS,
        ...(reference && { reference }),
      });
      if (html)
        await this.deps.saveSample({ siteId: site.id, feedId: f.id, url, html }).catch(() => {});
    }
    this.deps.highlight([]);
    this.emit({ busy: undefined });
    this.deps.close('saved');
  }
}
