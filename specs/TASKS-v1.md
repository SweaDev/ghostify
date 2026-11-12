# Ghostify v1: Tasks

Spec: `specs/SPEC-v1.md`. Plan: `specs/PLAN-v1.md`.

## Phase 1: Ghost items on dev.to

- [x] T01: Scaffold WXT + React + Tailwind project with Biome, Vitest and release workflow
  Refs: specs/PLAN-v1.md L10-21; specs/PLAN-v1.md L135-165
  Files: package.json, bun.lock, wxt.config.ts, tsconfig.json, biome.json, vitest.config.ts, tests/setup.ts, tests/smoke.test.ts, .gitignore, .github/workflows/release.yml, entrypoints/background.ts, entrypoints/popup/{index.html,main.tsx,App.tsx}, src/ui/theme.css, src/ui/GhostIcon.tsx, public/icon/*.png
  Depends: none
  Done: `bun run check`, `bun run build`, `bun run build:firefox`, `bun run zip`, `bun run zip:firefox` succeed; `GHOSTIFY_FLAVOR=newtab bun run zip` yields `*-newtab-*` zip names; workflow matches the Release section.

- [x] T02: Settings and sites storage, dev.to default site, view/profile resolution
  Refs: specs/SPEC-v1.md L10-12; specs/PLAN-v1.md L55-94; specs/PLAN-v1.md L111-115
  Files: src/sites/model.ts, src/sites/defaults.ts, src/sites/registry.ts, src/store/settings.ts, tests/sites.test.ts, tests/fixtures/devto.html
  Depends: T01
  Done: tests cover detectView (logged-in/out), resolveProfile matches `/`, `/latest`, `/top/week` for logged-out dev.to and nothing for `/some-article` or logged-in view; default sites seeded when storage empty.

- [x] T03: Dexie DB and items repository
  Refs: specs/PLAN-v1.md L55-94; specs/PLAN-v1.md L117-120
  Files: src/store/db.ts, src/store/items.ts, tests/items.test.ts
  Depends: T01
  Done: tests for ghostify (idempotent by key), unghost, setState, snooze, expireSnoozes (sets ghost + returnedAt), list by state/host/text, ghostedIds.

- [x] T04: Messaging protocol and background router
  Refs: specs/PLAN-v1.md L95-109; specs/PLAN-v1.md L22-54
  Files: src/messaging.ts, entrypoints/background.ts, src/background/handlers.ts, tests/handlers.test.ts
  Depends: T02, T03
  Done: handlers for isGhosted, ghostify, unghost, setState, listItems, openDashboard tested via direct calls; background registers them with onMessage.

- [x] T05: Item extraction and ghost button
  Refs: specs/SPEC-v1.md L13; specs/PLAN-v1.md L116; specs/PLAN-v1.md L172-181
  Files: src/feed/extract.ts, src/feed/ghost-button.ts, tests/extract.test.ts, tests/ghost-button.test.ts
  Depends: T01
  Done: extract returns title/url/excerpt/image/author for fixture dev.to stories; button mounts in a shadow host, shows over a hovered target, invokes callback on click, unmounts cleanly.

- [x] T06: Feed runtime and dev.to content script
  Refs: specs/SPEC-v1.md L3; specs/PLAN-v1.md L111-116; specs/PLAN-v1.md L95-109
  Files: src/feed/runtime.ts, src/feed/api.ts, entrypoints/devto.content.ts, tests/runtime.test.ts
  Depends: T02, T04, T05
  Done: runtime test on fixture doc: already-ghostified ids hidden on start; items added later (mutation) are checked; clicking ghost button calls ghostify and hides item; undo restores; dispose cleans up. Content script builds for both browsers.

- [x] T07: Popup with ghost list, README and version 0.1.0
  Refs: specs/SPEC-v1.md L8; specs/PLAN-v1.md L22-54; specs/PLAN-v1.md L144-156
  Files: entrypoints/popup/App.tsx, src/ui/ItemCard.tsx, src/ui/useItems.ts, src/ui/EmptyState.tsx, tests/ui.test.tsx, README.md, package.json
  Depends: T06
  Done: popup lists ghostified items (newest first) with open link and unghostify; README covers setup/build/run/load unpacked (local build and Release zip, Chrome + Firefox), T01–T07, spec coverage and what's missing; version 0.1.0; `bun run check` passes.

## Phase 2: Ghostify UI, snooze, new tab

- [x] T08: Dashboard shell with tabs and shared list components
  Refs: specs/SPEC-v1.md L3; specs/SPEC-v1.md L8; specs/PLAN-v1.md L22-54
  Files: entrypoints/dashboard/{index.html,main.tsx,App.tsx}, src/ui/Dashboard.tsx, src/ui/Tabs.tsx, src/ui/ItemList.tsx, src/ui/ItemCard.tsx, tests/dashboard.test.tsx
  Depends: T07
  Done: Ghostified / Later / Snoozed tabs with counts; per-item actions: open, move to Later, back to Ghostified, remove (unghostify); popup "Open Ghostify" opens dashboard; render test passes.

- [x] T09: Snooze with alarms and "Back from snooze"
  Refs: specs/PLAN-v1.md L117-120; specs/SPEC-v1.md L3
  Files: src/background/snooze.ts, entrypoints/background.ts, src/ui/SnoozeMenu.tsx, src/ui/Dashboard.tsx, tests/snooze.test.ts
  Depends: T08
  Done: snooze presets (later today, tomorrow, next week, custom date); snoozed items absent from Ghostified until expiry; alarm + startup check expires them; "Back from snooze" group appears; tests use fakeBrowser alarms.

- [x] T10: Search, site filter and item detail
  Refs: specs/SPEC-v1.md L3; specs/PLAN-v1.md L95-109
  Files: src/store/items.ts, src/ui/Dashboard.tsx, src/ui/FilterBar.tsx, src/ui/ItemDetail.tsx, tests/items.test.ts, tests/dashboard.test.tsx
  Depends: T08
  Done: keyword search over title/excerpt/author, site filter, detail drawer with full excerpt/image/link; tests pass.

- [x] T11: New-tab flavor
  Refs: specs/SPEC-v1.md L9; specs/PLAN-v1.md L5-9; specs/PLAN-v1.md L157-165
  Files: entrypoints/newtab/{index.html,main.tsx}, wxt.config.ts, package.json, .github/workflows/release.yml
  Depends: T08
  Done: default build has no `chrome_url_overrides`; `bun run build:newtab` manifest has `chrome_url_overrides.newtab` and name "Ghostify (New Tab)"; zips for both flavors build.

- [x] T12: README and version 0.2.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T09, T10, T11
  Done: README updated for Phase 2 (T01–T12, flavors, snooze), version 0.2.0, `bun run check` passes.

## Phase 3: Sites and custom selectors

- [x] T13: Options page with Sites manager
  Refs: specs/SPEC-v1.md L10-12; specs/PLAN-v1.md L55-94
  Files: entrypoints/options/{index.html,main.tsx,App.tsx}, src/ui/SitesSettings.tsx, src/sites/registry.ts, tests/sites-settings.test.tsx
  Depends: T12
  Done: list sites with enable/disable, delete (non-builtin), per-view profile list (view + path pattern + selectors), edit login indicator, export/import JSON (validated with feedgrab parseProfile); tests pass.

- [x] T14: Dynamic content script registration for user sites
  Refs: specs/PLAN-v1.md L121-124; specs/PLAN-v1.md L22-54
  Files: src/sites/registration.ts, entrypoints/feed.content.ts, entrypoints/background.ts, wxt.config.ts, tests/registration.test.ts
  Depends: T13
  Done: `optional_host_permissions` + `scripting` in manifest; enabling a site with granted permission registers `site-<id>`, disabling/deleting unregisters; sync on startup; tests with mocked scripting API.

- [x] T15: Add-site picker via feedgrab overlay
  Refs: specs/SPEC-v1.md L11; specs/PLAN-v1.md L121-124
  Files: entrypoints/picker.content.ts, src/sites/picker.ts, entrypoints/popup/App.tsx, src/background/handlers.ts, tests/picker.test.ts
  Depends: T14
  Done: popup "Add this site / Edit selectors" requests origin permission, injects picker; picker runs detectFeeds + openOverlay (existing profile passed when editing), then view chooser; saved profile merges into site; unit tests cover merge logic.

- [x] T16: Logged-in vs logged-out views end-to-end
  Refs: specs/SPEC-v1.md L12; specs/PLAN-v1.md L111-115
  Files: src/sites/model.ts, src/feed/runtime.ts, src/sites/picker.ts, tests/runtime.test.ts, tests/sites.test.ts
  Depends: T15
  Done: runtime re-resolves view when login indicator changes (body attribute mutation); picker can set login indicator by picking an element; tests cover switching views.

- [x] T17: README and version 0.3.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T16
  Done: README updated for Phase 3 (T01–T17, adding sites), version 0.3.0, `bun run check` passes.

## Phase 4: AI (Ollama + BYOK)

- [x] T18: AI settings and model factory
  Refs: specs/SPEC-v1.md L14-15; specs/PLAN-v1.md L55-94; specs/PLAN-v1.md L172-181
  Files: src/store/settings.ts, src/ai/models.ts, src/ui/AiSettings.tsx, entrypoints/options/App.tsx, src/background/handlers.ts, tests/models.test.tsx
  Depends: T17
  Done: per-purpose provider + model, keys, Ollama URL, enable toggle, "Test connection" (Ollama /api/tags), OLLAMA_ORIGINS hint; factory returns language/embedding models per provider; tests pass.

- [x] T19: Summaries and tags on ghostify
  Refs: specs/SPEC-v1.md L14; specs/PLAN-v1.md L125-129
  Files: src/ai/enrich.ts, src/background/jobs.ts, src/background/handlers.ts, src/ui/ItemCard.tsx, src/ui/ItemDetail.tsx, src/ui/FilterBar.tsx, tests/enrich.test.ts
  Depends: T18
  Done: after ghostify (AI on) background stores summary + tags; dashboard shows them and filters by tag; "Regenerate" action; tests with mocked model.

- [x] T20: Embeddings and semantic search
  Refs: specs/SPEC-v1.md L3; specs/SPEC-v1.md L14; specs/PLAN-v1.md L125-129
  Files: src/ai/embed.ts, src/background/jobs.ts, src/store/items.ts, src/ui/FilterBar.tsx, tests/embed.test.ts
  Depends: T18
  Done: embeddings stored per item; semantic toggle in search ranks by cosine (keyword fallback when AI off or failing); "Reindex" action for missing embeddings; tests pass.

- [x] T21: Decision handler (d3 + BYOK + fallback) for classify
  Refs: specs/SPEC-v1.md L14-15; specs/PLAN-v1.md L130-134; specs/PLAN-v1.md L172-181
  Files: src/ai/decision.ts, src/background/handlers.ts, tests/decision.test.ts
  Depends: T18
  Done: `fd:llm` handled in background; d3 systemone request built per criterion, parsed defensively; non-d3 uses handleLlmRequest; fallback on error; tests with mocked fetch/model.

- [x] T22: Auto-ghostify rules
  Refs: specs/PLAN-v1.md L125-129; specs/PLAN-v1.md L111-115
  Files: src/ui/SitesSettings.tsx, src/feed/runtime.ts, src/store/items.ts, src/ui/ItemCard.tsx, tests/runtime.test.ts
  Depends: T21
  Done: per-site rules editor; runtime injects enabled rules as llm-text exclusions when AI on; excluded items auto-ghostified with `auto` and hidden; "Auto" badge + "Not this" (unghostify) in UI; tests pass.

- [x] T23: README and version 1.0.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T19, T20, T22
  Done: README final (all features, AI setup with Ollama pulls and OLLAMA_ORIGINS, BYOK), version 1.0.0, `bun run check` passes.

## Phase 5: Hardening, performance, UI and in-browser models

- [x] T24: Message sender guard and input validation
  Refs: specs/PLAN-v1.md L51-53; specs/PLAN-v1.md L198-205
  Files: src/background/guard.ts, src/background/handlers.ts, src/sites/io.ts, tests/guard.test.ts, tests/sites-settings.test.tsx
  Depends: T23
  Done: content-script senders reach only the 5 feed messages and only for their page's host; drafts clamped, non-http(s) links dropped; bad imported hostnames/rules rejected; tests pass.

- [x] T25: Network limits (reader, Ollama, model lists) and extension CSP
  Refs: specs/PLAN-v1.md L199-205
  Files: src/feed/reader.ts, src/ai/models.ts, src/ai/catalog.ts, wxt.config.ts, tests/reader.test.ts
  Depends: T24
  Done: reader rejects non-http(s), non-HTML and >5 MB pages and times out at 20 s; Ollama status and model lists time out at 8 s; manifest CSP set; tests pass.

- [x] T26: Performance fixes
  Refs: specs/PLAN-v1.md L206-214
  Files: src/store/db.ts, src/store/items.ts, src/background/jobs.ts, src/background/indexer.ts, src/ai/catalog.ts, src/feed/content.ts, src/feed/runtime.ts, src/feed/ghost-button.ts, tests/items.test.ts, tests/runtime.test.ts
  Depends: T24
  Done: items indexed by [state+createdAt] with limit; search reads one model's vectors; backlog computed once per run; capability memo; selective content restarts; throttled view watcher; rAF button placement; tests pass.

- [x] T27: UI fixes
  Refs: specs/PLAN-v1.md L215-223
  Files: src/ui/GeneralSettings.tsx, src/ui/AiSettings.tsx, src/ui/Dashboard.tsx, src/ui/ItemList.tsx, src/ui/ItemDetail.tsx, src/ui/ItemCard.tsx, src/ui/SitesSettings.tsx, src/ui/AiActivity.tsx, src/ui/Toast.tsx, src/store/items.ts, tests/dashboard.test.tsx
  Depends: T26
  Done: live settings hook; Ollama URL saved on blur; dashboard Unghostify has Undo; "Show more" paging; viewer survives filter changes; focus moves into drawers and back; site delete confirms; tests pass.

- [x] T28: In-browser model host (offscreen page + Transformers.js worker)
  Refs: specs/PLAN-v1.md L224-239
  Files: package.json, bun.lock, wxt.config.ts, entrypoints/offscreen/{index.html,main.ts}, src/ai/browser/{catalog.ts,protocol.ts,gate.ts,worker.ts,host.ts}, src/store/browser-models.ts, src/background/browser-models.ts, tests/browser-host.test.ts
  Depends: T25
  Done: builds ship `offscreen.html`, a worker chunk and ORT's wasm (no model files); Chrome manifest has `offscreen`, Firefox doesn't; host relays load/embed/generate/classify/abort with progress; downloads recorded; fetch gate blocks undownloaded models; tests with a fake channel pass.

- [x] T29: Browser provider as the default (AI SDK adapters, NLI decisions, readiness)
  Refs: specs/PLAN-v1.md L224-229; specs/PLAN-v1.md L240-244
  Files: src/ai/browser/provider.ts, src/ai/models.ts, src/ai/decision.ts, src/ai/check.ts, src/ai/content.ts, src/store/settings.ts, src/background/jobs.ts, src/background/indexer.ts, src/background/handlers.ts, src/messaging.ts, tests/browser-provider.test.ts
  Depends: T28
  Done: `browser` provider is the default for all purposes; language/embedding adapters pass AI SDK generate/stream/embed/structured output against a fake host; decisions via zero-shot map to ClassifyResponse; jobs skip undownloaded models; tests pass.

- [x] T30: AI settings: browser model downloads
  Refs: specs/PLAN-v1.md L224-239
  Files: src/ui/BrowserModels.tsx, src/ui/AiSettings.tsx, src/ui/useBrowserModels.ts, src/background/handlers.ts, src/messaging.ts, tests/browser-models.test.tsx
  Depends: T29
  Done: "In your browser" provider listed first; per-purpose model card shows size, status, progress, Download / Delete, device choice (CPU / GPU); render test passes.

- [x] T31: README and version 1.2.0
  Refs: specs/PLAN-v1.md L144-171; specs/PLAN-v1.md L198-244
  Files: README.md, package.json
  Depends: T27, T30
  Done: README covers browser models (download, sizes, CPU/GPU, privacy), hardening notes, T24–T31; version 1.2.0; `bun run check` and all builds/zips pass.

## Phase 6: Backups, site-wide ignored parameters, picker usability

- [x] T32: Data backups and full snapshots
  Refs: specs/PLAN-v1.md L264-269
  Files: src/store/backup.ts, src/store/snapshots.ts, src/ui/BackupSettings.tsx, src/ui/GeneralSettings.tsx, tests/backup.test.ts
  Depends: none
  Done: data backup has only items and kept and merges on restore (newer `updatedAt` wins); full snapshot has every table but secrets plus sites and settings and replaces them on restore; snapshots live in `ghostify-snapshots`, automatic ones capped at 5; a restore takes a `before-restore` snapshot first; Settings → General → Backups lists, downloads, restores and deletes; tests pass.

- [x] T33: Draggable chooser panels
  Refs: specs/PLAN-v1.md L273
  Files: src/sites/panel.ts, src/sites/link-chooser.ts, src/sites/structure-chooser.ts, src/sites/view-chooser.ts, tests/panel.test.ts
  Depends: none
  Done: link, structure and view choosers use one panel with a step label, drag handle (kept in the viewport), collapse, and a position remembered per site in `local:pickerPanel`; existing chooser tests and new panel tests pass.

- [x] T34: Ghostified items shown blurred while picking
  Refs: specs/PLAN-v1.md L273
  Files: src/feed/runtime.ts, src/feed/reveal.ts, src/sites/run-picker.ts, tests/runtime.test.ts
  Depends: T33
  Done: `ghostify:picking` start restores hidden items, turns the ghost button off and draws labelled blurred boxes in the runtime's shadow root that follow scroll and resize; stop hides them again; the picker reveals before `detectFeeds`; tests pass.

- [ ] T35: Docs and version 1.8.0
  Refs: specs/PLAN-v1.md L264-273
  Files: CHANGELOG.md, README.md, package.json
  Depends: T32, T34
  Done: CHANGELOG 1.8.0 section and links; README Updates and Latest; version 1.8.0; `bun run check`, builds and zips pass; tag v1.8.0.

- [ ] T36: feedgrab: site-wide ignored query parameters and id exports
  Refs: specs/PLAN-v1.md L270
  Files: ../feedgrab/src/types.ts, ../feedgrab/src/profile/schema.ts, ../feedgrab/src/detect/permalink.ts, ../feedgrab/src/feed/item-id.ts, ../feedgrab/src/feed/unified-feed.ts, ../feedgrab/src/index.ts, ../feedgrab/tests/unit/*
  Depends: none
  Done: `FeedDescriptor.permalinkIgnore` is validated and dropped from ids when `permalinkParams` is unset; `suggestPermalinkParams` leaves them out; `canonicalUrl` and `permalinkId` exported; feedgrab `bun run check` passes; committed in feedgrab.

- [ ] T37: feedgrab: draggable overlay panel and scroll to feed
  Refs: specs/PLAN-v1.md L272
  Files: ../feedgrab/src/overlay/*, ../feedgrab/tests/unit/*
  Depends: T36
  Done: panel drags by its header within the viewport and collapses; `position`/`onMove` options; "Feed N" scrolls the feed's first item to the top below a fixed/sticky header and outlines it; feedgrab `bun run check` passes; committed in feedgrab.

- [ ] T38: feedgrab: version 0.5.0
  Refs: specs/PLAN-v1.md L270-272
  Files: ../feedgrab/package.json, ../feedgrab/src/index.ts, ../feedgrab/tests/unit/smoke.test.ts, ../feedgrab/README.md, ../feedgrab/CHANGELOG.md
  Depends: T36, T37
  Done: version 0.5.0 everywhere feedgrab's AGENTS.md lists; feedgrab `bun run check` passes; committed; the user pushes tag v0.5.0 to publish the tarball.

- [ ] T39: Site-wide ignored query parameters in Ghostify
  Refs: specs/PLAN-v1.md L270; specs/PLAN-v1.md L272
  Files: package.json, bun.lock, src/sites/model.ts, src/sites/links.ts, src/sites/link-chooser.ts, src/sites/run-picker.ts, src/sites/io.ts, src/feed/runtime.ts, src/feed/extract.ts, src/store/db.ts, src/ui/SitesSettings.tsx, src/ui/SampleCheck.tsx, tests/links.test.ts, tests/runtime.test.ts, tests/sites-settings.test.tsx
  Depends: T38
  Done: feedgrab 0.5.0 tarball; `Site.ignoreParams` saved, imported and exported; added to every feed without its own choice at runtime and in sample checks; the chooser defaults unticks to the site list with "Only this feed"; Settings edits the list and marks overrides; the feedgrab overlay position is remembered; new items store `feedId`; tests pass.

- [ ] T40: Re-key Ghostified items after identity rules change
  Refs: specs/PLAN-v1.md L271
  Files: src/store/rekey.ts, src/ui/RekeyBanner.tsx, src/ui/Dashboard.tsx, tests/rekey.test.ts
  Depends: T32, T39
  Done: dry run counts movable items per host; Update takes a `before-rekey` snapshot and moves items, kept, embeddings, contents and AI job keys in one transaction; collisions merge as D56 says; text-id items untouched; banner render test and rekey tests pass.

- [ ] T41: Docs and version 1.9.0
  Refs: specs/PLAN-v1.md L264-273
  Files: CHANGELOG.md, README.md, package.json
  Depends: T39, T40
  Done: CHANGELOG 1.9.0 section and links; README covers backups, ignored parameters and re-keying; README Updates and Latest; version 1.9.0; phase check from a clean state passes; tag v1.9.0.
