# Ghostify v2: Tasks

Spec: `specs/SPEC-v2.md`. Plan: `specs/PLAN-v2.md`. feedgrab tasks: `../feedgrab/spec/TASKS-02.md`.

## Phase 7: Content kinds (v1.10.0)

- [x] T42: Install feedgrab 0.7.0
  Refs: specs/PLAN-v2.md L35-41; specs/PLAN-v2.md L43-44
  Files: package.json, bun.lock
  Depends: feedgrab T51 (v0.7.0 released; v0.6.0 is tagged without a release, E3)
  Done: `package.json` points at the v0.7.0 release tarball; `bun install --frozen-lockfile` and `bun run check` pass.

- [x] T43: Content kinds in the data model and extraction
  Refs: specs/SPEC-v2.md L7-8; specs/PLAN-v2.md L5-20; specs/PLAN-v2.md L24-27
  Files: src/store/db.ts, src/feed/extract.ts, src/sites/defaults.ts, src/background/guard.ts, src/store/items.ts, src/messaging.ts, tests/extract.test.ts, tests/guard.test.ts, tests/items.test.ts
  Depends: T42
  Done: Dexie v9 with a `kind` index; `extractItem` maps `item.content()` (no extraction logic left in Ghostify); dev.to's author is a feedgrab field rule; drafts clamp the new fields and keep only http(s) media and image URLs; `listItems({ kind })` filters (missing kind = post); tests pass.

- [x] T44: Kind badge, duration and Kind filter
  Refs: specs/SPEC-v2.md L9; specs/PLAN-v2.md L28
  Files: src/ui/ItemCard.tsx, src/ui/FilterBar.tsx, src/ui/Dashboard.tsx, src/ui/useItems.ts, src/ui/format.ts, tests/ui.test.tsx, tests/dashboard.test.tsx
  Depends: T43
  Done: cards show a kind badge for non-posts and a duration chip for media; the Kind filter lists All / Posts / Images / Videos / Audio / PDFs and filters the list; render tests pass.

- [x] T45: Remove code feedgrab now owns
  Refs: specs/PLAN-v2.md L29-30
  Files: src/sites/selector.ts, src/sites/run-picker.ts, src/sites/links.ts, src/sites/link-chooser.ts, src/ui/SitesSettings.tsx, src/ui/SampleCheck.tsx, tests/selector.test.ts, tests/links.test.ts
  Depends: T42
  Done: `selectorFor` replaced by feedgrab `generateSelector`, `checkFeed` by `checkDescriptor`; their tests now cover the Ghostify callers only; `bun run check` passes.

- [x] T46: Docs and version 1.10.0
  Refs: specs/PLAN-v2.md L35-41
  Files: CHANGELOG.md, README.md, package.json
  Depends: T43, T44, T45
  Done: CHANGELOG 1.10.0 and links; README Updates and Latest; version 1.10.0; `bun run check`, builds and zips pass; tag v1.10.0.

## Phase 8: Viewers and thumbnails (v1.11.0)

- [x] T47: Thumbnails — Refs: specs/SPEC-v2.md L8; specs/PLAN-v2.md L31. Local thumbnail per item (≤ 64 KB), host permission asked at grab time, backups and snapshots include them.
- [x] T48: Viewers by kind — Refs: specs/SPEC-v2.md L9; specs/PLAN-v2.md L32. Post, image, video, audio and PDF viewers; Play on site fallback.
- [x] T49: Docs and version 1.11.0

## Phase 9: Grab panel (v1.12.0)

- [x] T50: (done in T42: feedgrab 0.7.0 is installed in Phase 7, E3)
- [x] T51: Grab protocol and page agent — Refs: specs/PLAN-v2.md L33.
- [x] T52: Grab panel page (Feeds, Content, Save; advanced options folded) — Refs: specs/SPEC-v2.md L10-15.
- [x] T53: Dock and pop-out window — Refs: specs/SPEC-v2.md L15; specs/PLAN-v2.md L33.
- [x] T54: Settings → Sites content type and fields — Refs: specs/SPEC-v2.md L17.
- [x] T55: Remove the old choosers; docs and version 1.12.0

## Phase 10: Item pages (v2.0.0)

- [x] T56: Install feedgrab 0.8.0 — Depends: feedgrab T54.
- [x] T57: Reader and item pages through `feedgrab/page` — Refs: specs/SPEC-v2.md L16.
- [x] T58: Docs and version 2.0.0
