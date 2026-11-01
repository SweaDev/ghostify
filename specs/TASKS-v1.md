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

- [ ] T04: Messaging protocol and background router
  Refs: specs/PLAN-v1.md L95-109; specs/PLAN-v1.md L22-54
  Files: src/messaging.ts, entrypoints/background.ts, src/background/handlers.ts, tests/handlers.test.ts
  Depends: T02, T03
  Done: handlers for isGhosted, ghostify, unghost, setState, listItems, openDashboard tested via direct calls; background registers them with onMessage.

- [ ] T05: Item extraction and ghost button
  Refs: specs/SPEC-v1.md L13; specs/PLAN-v1.md L116; specs/PLAN-v1.md L172-181
  Files: src/feed/extract.ts, src/feed/ghost-button.ts, tests/extract.test.ts, tests/ghost-button.test.ts
  Depends: T01
  Done: extract returns title/url/excerpt/image/author for fixture dev.to stories; button mounts in a shadow host, shows over a hovered target, invokes callback on click, unmounts cleanly.

- [ ] T06: Feed runtime and dev.to content script
  Refs: specs/SPEC-v1.md L3; specs/PLAN-v1.md L111-116; specs/PLAN-v1.md L95-109
  Files: src/feed/runtime.ts, src/feed/api.ts, entrypoints/devto.content.ts, tests/runtime.test.ts
  Depends: T02, T04, T05
  Done: runtime test on fixture doc: already-ghosted ids hidden on start; items added later (mutation) are checked; clicking ghost button calls ghostify and hides item; undo restores; dispose cleans up. Content script builds for both browsers.

- [ ] T07: Popup with ghost list, README and version 0.1.0
  Refs: specs/SPEC-v1.md L8; specs/PLAN-v1.md L22-54; specs/PLAN-v1.md L144-156
  Files: entrypoints/popup/App.tsx, src/ui/ItemCard.tsx, src/ui/useItems.ts, src/ui/EmptyState.tsx, tests/ui.test.tsx, README.md, package.json
  Depends: T06
  Done: popup lists ghosted items (newest first) with open link and un-ghost; README covers setup/build/run/load unpacked (local build and Release zip, Chrome + Firefox), T01–T07, spec coverage and what's missing; version 0.1.0; `bun run check` passes.

## Phase 2: Ghostify UI, snooze, new tab

- [ ] T08: Dashboard shell with tabs and shared list components
  Refs: specs/SPEC-v1.md L3; specs/SPEC-v1.md L8; specs/PLAN-v1.md L22-54
  Files: entrypoints/dashboard/{index.html,main.tsx,App.tsx}, src/ui/Dashboard.tsx, src/ui/Tabs.tsx, src/ui/ItemList.tsx, src/ui/ItemCard.tsx, tests/dashboard.test.tsx
  Depends: T07
  Done: Ghosted / Later / Snoozed tabs with counts; per-item actions: open, move to Later, back to Ghosted, remove (un-ghost); popup "Open Ghostify" opens dashboard; render test passes.

- [ ] T09: Snooze with alarms and "Back from snooze"
  Refs: specs/PLAN-v1.md L117-120; specs/SPEC-v1.md L3
  Files: src/background/snooze.ts, entrypoints/background.ts, src/ui/SnoozeMenu.tsx, src/ui/Dashboard.tsx, tests/snooze.test.ts
  Depends: T08
  Done: snooze presets (later today, tomorrow, next week, custom date); snoozed items absent from Ghosted until expiry; alarm + startup check expires them; "Back from snooze" group appears; tests use fakeBrowser alarms.

- [ ] T10: Search, site filter and item detail
  Refs: specs/SPEC-v1.md L3; specs/PLAN-v1.md L95-109
  Files: src/store/items.ts, src/ui/Dashboard.tsx, src/ui/FilterBar.tsx, src/ui/ItemDetail.tsx, tests/items.test.ts, tests/dashboard.test.tsx
  Depends: T08
  Done: keyword search over title/excerpt/author, site filter, detail drawer with full excerpt/image/link; tests pass.

- [ ] T11: New-tab flavor
  Refs: specs/SPEC-v1.md L9; specs/PLAN-v1.md L5-9; specs/PLAN-v1.md L157-165
  Files: entrypoints/newtab/{index.html,main.tsx}, wxt.config.ts, package.json, .github/workflows/release.yml
  Depends: T08
  Done: default build has no `chrome_url_overrides`; `bun run build:newtab` manifest has `chrome_url_overrides.newtab` and name "Ghostify (New Tab)"; zips for both flavors build.

- [ ] T12: README and version 0.2.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T09, T10, T11
  Done: README updated for Phase 2 (T01–T12, flavors, snooze), version 0.2.0, `bun run check` passes.

## Phase 3: Sites and custom selectors

- [ ] T13: Options page with Sites manager
  Refs: specs/SPEC-v1.md L10-12; specs/PLAN-v1.md L55-94
  Files: entrypoints/options/{index.html,main.tsx,App.tsx}, src/ui/SitesSettings.tsx, src/sites/registry.ts, tests/sites-settings.test.tsx
  Depends: T12
  Done: list sites with enable/disable, delete (non-builtin), per-view profile list (view + path pattern + selectors), edit login indicator, export/import JSON (validated with feedgrab parseProfile); tests pass.

- [ ] T14: Dynamic content script registration for user sites
  Refs: specs/PLAN-v1.md L121-124; specs/PLAN-v1.md L22-54
  Files: src/sites/registration.ts, entrypoints/feed.content.ts, entrypoints/background.ts, wxt.config.ts, tests/registration.test.ts
  Depends: T13
  Done: `optional_host_permissions` + `scripting` in manifest; enabling a site with granted permission registers `site-<id>`, disabling/deleting unregisters; sync on startup; tests with mocked scripting API.

- [ ] T15: Add-site picker via feedgrab overlay
  Refs: specs/SPEC-v1.md L11; specs/PLAN-v1.md L121-124
  Files: entrypoints/picker.content.ts, src/sites/picker.ts, entrypoints/popup/App.tsx, src/background/handlers.ts, tests/picker.test.ts
  Depends: T14
  Done: popup "Add this site / Edit selectors" requests origin permission, injects picker; picker runs detectFeeds + openOverlay (existing profile passed when editing), then view chooser; saved profile merges into site; unit tests cover merge logic.

- [ ] T16: Logged-in vs logged-out views end-to-end
  Refs: specs/SPEC-v1.md L12; specs/PLAN-v1.md L111-115
  Files: src/sites/model.ts, src/feed/runtime.ts, src/sites/picker.ts, tests/runtime.test.ts, tests/sites.test.ts
  Depends: T15
  Done: runtime re-resolves view when login indicator changes (body attribute mutation); picker can set login indicator by picking an element; tests cover switching views.

- [ ] T17: README and version 0.3.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T16
  Done: README updated for Phase 3 (T01–T17, adding sites), version 0.3.0, `bun run check` passes.

## Phase 4: AI (Ollama + BYOK)

- [ ] T18: AI settings and model factory
  Refs: specs/SPEC-v1.md L14-15; specs/PLAN-v1.md L55-94; specs/PLAN-v1.md L172-181
  Files: src/store/settings.ts, src/ai/models.ts, src/ui/AiSettings.tsx, entrypoints/options/App.tsx, src/background/handlers.ts, tests/models.test.ts
  Depends: T17
  Done: per-purpose provider + model, keys, Ollama URL, enable toggle, "Test connection" (Ollama /api/tags), OLLAMA_ORIGINS hint; factory returns language/embedding models per provider; tests pass.

- [ ] T19: Summaries and tags on ghostify
  Refs: specs/SPEC-v1.md L14; specs/PLAN-v1.md L125-129
  Files: src/ai/enrich.ts, src/background/jobs.ts, src/background/handlers.ts, src/ui/ItemCard.tsx, src/ui/ItemDetail.tsx, src/ui/FilterBar.tsx, tests/enrich.test.ts
  Depends: T18
  Done: after ghostify (AI on) background stores summary + tags; dashboard shows them and filters by tag; "Regenerate" action; tests with mocked model.

- [ ] T20: Embeddings and semantic search
  Refs: specs/SPEC-v1.md L3; specs/SPEC-v1.md L14; specs/PLAN-v1.md L125-129
  Files: src/ai/embed.ts, src/background/jobs.ts, src/store/items.ts, src/ui/FilterBar.tsx, tests/embed.test.ts
  Depends: T18
  Done: embeddings stored per item; semantic toggle in search ranks by cosine (keyword fallback when AI off or failing); "Reindex" action for missing embeddings; tests pass.

- [ ] T21: Decision handler (d3 + BYOK + fallback) for classify
  Refs: specs/SPEC-v1.md L14-15; specs/PLAN-v1.md L130-134; specs/PLAN-v1.md L172-181
  Files: src/ai/decision.ts, src/background/handlers.ts, tests/decision.test.ts
  Depends: T18
  Done: `fd:llm` handled in background; d3 systemone request built per criterion, parsed defensively; non-d3 uses handleLlmRequest; fallback on error; tests with mocked fetch/model.

- [ ] T22: Auto-ghostify rules
  Refs: specs/PLAN-v1.md L125-129; specs/PLAN-v1.md L111-115
  Files: src/ui/SitesSettings.tsx, src/feed/runtime.ts, src/store/items.ts, src/ui/ItemCard.tsx, tests/runtime.test.ts
  Depends: T21
  Done: per-site rules editor; runtime injects enabled rules as llm-text exclusions when AI on; excluded items auto-ghostified with `auto` and hidden; "Auto" badge + "Not this" (un-ghost) in UI; tests pass.

- [ ] T23: README and version 1.0.0
  Refs: specs/PLAN-v1.md L144-171
  Files: README.md, package.json
  Depends: T19, T20, T22
  Done: README final (all features, AI setup with Ollama pulls and OLLAMA_ORIGINS, BYOK), version 1.0.0, `bun run check` passes.
