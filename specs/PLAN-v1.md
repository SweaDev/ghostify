# Ghostify v1: Plan

Source spec: `specs/SPEC-v1.md`. Tasks: `specs/TASKS-v1.md`.

## Clarified requirements
- Snooze: the item stays hidden on the site. It also leaves the Ghostify list until `snoozeUntil`, then comes back in a "Back from snooze" section (`state: 'ghost'`, `returnedAt` set).
- Decision model: auto-ghostify rules. Plain-language rules per site are checked against new feed items, and matches are auto-ghostified (`auto` set, undo possible).
- New tab: a separate build flavor (`GHOSTIFY_FLAVOR=newtab`) yields `ghostify-newtab` zips that override the new tab with the dashboard. The default flavor never overrides it.

## Stack
- Bun is the package manager and script runner (`bun.lock` committed). TypeScript runs in strict mode.
- WXT 0.21 targets Chrome MV3 and Firefox MV3 (`wxt -b firefox`).
- The UI is React 19 via `@wxt-dev/module-react`, with Tailwind CSS v4 via `@tailwindcss/vite` and icons from `lucide-react`.
- feedgrab 0.1.0 is installed from its release tarball `https://github.com/SweaDev/feedgrab/releases/download/v0.1.0/feedgrab-0.1.0.tgz`. It isn't published to npm, and `github:` installs don't work.
- Dexie 4 (IndexedDB) stores ghost items and embeddings. Only the background and extension pages open it.
- WXT `storage` (`browser.storage.local`) holds settings and sites, so content scripts can read and watch them.
- `@webext-core/messaging` provides typed messaging.
- AI uses `ai` v7 with the providers `@ai-sdk/openai-compatible` (Ollama, OpenRouter embeddings), `@ai-sdk/openai`, `@openrouter/ai-sdk-provider` and `@ai-sdk/google`.
- Tests use Vitest via `wxt/testing` (`WxtVitest()` plugin, `fakeBrowser`), the `happy-dom` environment, and `fake-indexeddb`.
- Biome 2 handles lint and format.

## Architecture
```
entrypoints/
  background.ts         router for messages, snooze alarms, AI jobs, LLM proxy host
  devto.content.ts      static content script, matches *://dev.to/*
  feed.content.ts       same runtime; registered at runtime for user-added sites
  picker.content.ts     unlisted script injected on demand to add/edit a site (feedgrab overlay)
  popup/                compact list of recent ghosts, counts, "Add this site", open dashboard
  dashboard/            full UI: tabs Ghosted / Later / Snoozed, search, filters, detail
  options/              settings: Sites, AI, General
  newtab/               dashboard mounted as new tab (newtab flavor only)
src/
  feed/runtime.ts       startFeedRuntime(doc, url): site → view → profile → openFeed → hide/ghost/auto
  feed/ghost-button.ts  one floating shadow-DOM button positioned over the hovered item
  feed/extract.ts       extractItem(FeedItem, host) → GhostDraft
  sites/model.ts        Site types, resolveProfile(sites, url, doc), detectView(site, doc)
  sites/defaults.ts     DEVTO_SITE
  sites/registry.ts     sites storage item, register/unregister dynamic content scripts
  store/db.ts           Dexie schema (items, embeddings)
  store/items.ts        repository: ghostify, unghost, setState, snooze, list, expireSnoozes
  store/settings.ts     settings storage item + defaults
  messaging.ts          ProtocolMap (defineExtensionMessaging)
  ai/models.ts          ModelRef → LanguageModel / EmbeddingModel factory
  ai/enrich.ts          summary + tags (general model, structured output)
  ai/embed.ts           embed + cosine search
  ai/decision.ts        classify handler: d3 systemone adapter, BYOK via feedgrab handleLlmRequest, fallback
  ui/                   shared React: theme.css, ItemCard, ItemList, Tabs, EmptyState, GhostIcon, useItems
tests/                  *.test.ts(x), fixtures/devto.html (trimmed real markup)
```
Rules:
- Content scripts never open IndexedDB and never see API keys. They talk to the background through `messaging.ts`.
- Feed nodes are changed only through feedgrab `removeItem` (mode `hide`). The ghost button lives in its own shadow host on `document.documentElement`.

## Data models
```ts
type ItemState = 'ghost' | 'later' | 'snoozed';
type View = 'any' | 'loggedIn' | 'loggedOut';
interface GhostItem {
  key: string;            // `${host}:${id}`
  id: string;             // feedgrab FeedItem.id (hash of canonical permalink)
  host: string; siteId: string; view: View;
  url?: string; title: string; excerpt: string; image?: string; author?: string;
  state: ItemState; snoozeUntil?: number; returnedAt?: number;
  auto?: { ruleId: string; criteria: string; confidence: number };
  summary?: string; tags?: string[];
  createdAt: number; updatedAt: number;
}
interface Embedding { key: string; model: string; dim: number; vector: number[] }
// Dexie v1: items 'key, state, host, createdAt, snoozeUntil, *tags'; embeddings 'key'
interface SiteProfileEntry { view: View; profile: SiteProfile }   // feedgrab SiteProfile
interface Site {
  id: string; hostname: string; label: string; enabled: boolean; builtin: boolean;
  loginIndicator?: { selector: string; whenPresent: 'loggedIn' | 'loggedOut' };
  profiles: SiteProfileEntry[];
  rules: { id: string; criteria: string; enabled: boolean }[];
}
type Provider = 'ollama' | 'openai' | 'openrouter' | 'gemini';
interface ModelRef { provider: Provider; model: string }
interface Settings {
  ai: { enabled: boolean; ollamaBaseUrl: string;
        embedding: ModelRef; general: ModelRef; decision: ModelRef;
        keys: { openai?: string; openrouter?: string; gemini?: string } };
  ui: { theme: 'system' | 'light' | 'dark' };
}
```
Defaults:
- Ollama base URL `http://localhost:11434`, with models `embeddinggemma-2`, `gemma4:e2b` and `d3:2b`.
- dev.to:
  - `loginIndicator { selector: 'body[data-user-status="logged-in"]', whenPresent: 'loggedIn' }`.
  - Logged-out profiles for path patterns `/`, `/latest` and `/top/*`, with two feeds:
    - `#substories` → `:scope > .crayons-story`
    - `#main-content` → `:scope .crayons-story--featured`

## Key interfaces
```ts
// messaging.ts
isGhosted(data: { host: string; ids: string[] }): string[];      // ids that are hidden (any state)
ghostify(data: GhostDraft): GhostItem;                            // GhostDraft = GhostItem minus state/timestamps
unghost(data: { key: string }): void;
setState(data: { key: string; state: ItemState; snoozeUntil?: number }): GhostItem;
listItems(data: ListQuery): GhostItem[];                          // state, host, tag, text, semantic
'fd:llm'(data: { req: LlmRequest }): { ok: true; res: unknown } | { ok: false; error: { code: string; message: string } };
openDashboard(): void; addSite(data: { tabId: number }): void;
// feed/runtime.ts
startFeedRuntime(opts: { doc: Document; url: string; sites: Site[]; api: RuntimeApi }): { dispose(): void };
```
`RuntimeApi` wraps the messages above so the runtime can be tested with fakes.

## Flows
- **Load**:
  1. `resolveProfile` picks the site by hostname and its view by the login indicator, then runs feedgrab `matchProfile` over that view's profiles plus the `any` profiles.
  2. `openFeed(doc, profile, { llm })` opens the feed.
  3. For each `item:added`, the ids are batched to `isGhosted` and matches go through `removeItem`.
  4. Kept items get the hover button.
- **Ghostify**: clicking the button sends `extractItem` → `ghostify` → `removeItem`, then a toast offers "Undo", which calls `unghost` and the handle's `restore`.
- **Snooze**:
  - Setting it stores `state: 'snoozed'`, `snoozeUntil`, and an alarm `snooze-check` every 15 minutes, plus a check at startup.
  - `expireSnoozes(now)` sets `state: 'ghost'` and `returnedAt`.
  - The dashboard shows a "Back from snooze" group for items with `returnedAt` in the last 7 days.
- **Add site**:
  1. The popup requests `permissions.request({ origins: [origin/*] })`, and the background injects `picker.content.js` with `scripting.executeScript`.
  2. The picker runs `detectFeeds` and then `openOverlay`, and shows a small view chooser (any / logged in / logged out, plus an optional login indicator selector).
  3. It saves to `sites`, and the background calls `scripting.registerContentScripts` with `{ id: 'site-<id>', matches, js: ['content-scripts/feed.js'] }`.
- **AI**:
  - It is off by default.
  - On `ghostify`, the background queues `enrich` (summary + ≤5 tags) and `embed` (title + excerpt). Failures are logged and skipped.
  - `listItems({ semantic })` embeds the query, ranks by cosine, and falls back to keyword search.
  - Auto rules become feedgrab `llm-text` exclude rules on the matched profile at runtime, and items marked `excluded` are auto-ghostified.
- **Classify** (`fd:llm`, background):
  - If the decision provider is `ollama` and its model starts with `d3`, it uses the systemone adapter. Otherwise it uses `handleLlmRequest(req, decisionModel)`.
  - On error it falls back to `handleLlmRequest(req, generalModel)`.
  - `detect` requests always use the general model.

## Testing
- Vitest runs through `bun run test` with the `happy-dom` environment and `WxtVitest()`. `fake-indexeddb/auto` is imported in `tests/setup.ts`.
- Unit tests:
  - extract (fixture), site/view resolution, the items repository and snooze expiry;
  - the runtime (fixture doc, fake `RuntimeApi`): already-ghosted items are hidden, clicking ghostifies, auto rules apply;
  - the model factory, the d3 parser, the decision fallback, cosine ranking.
- UI components get light render tests with `@testing-library/react`.
- Phase check: `bun run check` (lint + typecheck + test), then `bun run build`, `bun run build:firefox`, `bun run zip`, `bun run zip:firefox`.

## Commands
| Command | Does |
|---|---|
| `bun install` | install deps |
| `bun run dev` / `bun run dev:firefox` | dev with HMR |
| `bun run build` / `bun run build:firefox` | build to `.output/chrome-mv3`, `.output/firefox-mv3` |
| `bun run build:newtab` / `bun run build:newtab:firefox` | newtab flavor builds |
| `bun run zip` / `bun run zip:firefox` | zips (+ sources zip for Firefox) |
| `bun run test` | vitest run |
| `bun run lint` / `bun run format` | biome check / biome format --write |
| `bun run typecheck` | `wxt prepare && tsc --noEmit` |
| `bun run check` | lint + typecheck + test |

## Release
`.github/workflows/release.yml` runs on `push: tags: ['v*']` with `permissions: contents: write`. It:
1. checks out the repo and runs `oven-sh/setup-bun@v2`;
2. runs `bun install --frozen-lockfile` and `bun run test`;
3. runs `bunx wxt zip`, `bunx wxt zip -b firefox`, and the same with `GHOSTIFY_FLAVOR=newtab`;
4. runs `gh release create "$GITHUB_REF_NAME" .output/*.zip --generate-notes` (`GH_TOKEN: ${{ github.token }}`).

The zip names come from `zip.artifactTemplate` and `zip.sourcesTemplate`, and include `{{browser}}` and the flavor suffix.

## Phases
1. Ghost on dev.to: T01–T07 → v0.1.0
2. Ghostify UI, snooze, new tab: T08–T12 → v0.2.0
3. Sites and custom selectors: T13–T17 → v0.3.0
4. AI: T18–T23 → v1.0.0

## Decisions
- D1: The ghost button is one floating button shown on hover, so page layout is never touched.
- D2: Data stays local only, with no sync. API keys live in `storage.local`, are used only in the background, and are never sent to content scripts.
- D3: Item identity is feedgrab `item.id`, scoped by host (`key = host:id`).
- D4: Hiding uses feedgrab `removeItem` mode `hide`.
- D5: OpenRouter embeddings use its OpenAI-compatible `/api/v1/embeddings` via `@ai-sdk/openai-compatible`.
- D6: The d3 response shape isn't documented. The parser accepts `answers[q].noul` as a boolean, a number in 0..1, or `{ value, probability }`, and treats anything else as not matched (logged).
- D7: Publishing to browser stores is out of scope.
- D8: React + Tailwind was picked for the UI. It is the best-supported WXT module, and Tailwind keeps the styling consistent across the popup, dashboard, options and new tab.
- D9: feedgrab's happy-dom `parseHtml` truncates the full dev.to page. Tests use a trimmed fixture built with `document.body.innerHTML`.
- D10: Content scripts only pass proxy backends to feedgrab. `build/feedgrab-proxy-only.ts` stubs feedgrab's lazy AI SDK model runner, which keeps `ai` out of the content-script bundle (380 KB → 71 KB).
- D11: The runtime re-checks re-mounted items (feedgrab `item:updated` with a new element), so items ghosted in another tab stay hidden after re-renders.
- D12: Newtab-flavor builds go to `.output/<browser>-mv3-newtab` (`outDirTemplate`), so they never overwrite the default flavor's build.
- D13: `picker.content.ts` starts the picker without returning its promise. `scripting.executeScript` awaits a returned promise, and holding it open while the user works in the overlay tore the tab down in Chromium.
- D14: For a new page, the picker pre-accepts feedgrab's best proposal by passing it as the overlay's `existing` profile. Saving with no feeds ticked shows a notice and saves nothing.
- D15: API keys live in a Dexie `secrets` table (extension origin), not in `storage.local`, because content scripts can read `storage.local`. `Settings.ai` holds no keys; `getKeys()` is used only by the background and the options page.
- D16: Embeddings use no task prefixes. The embeddinggemma-2 page doesn't document the prefix syntax. Each stored embedding is tagged `provider:model`; ranking ignores other models' vectors, and Settings → AI → Reindex fills the gaps.
- D17: "Not this" on an auto-ghosted item unghosts it and records its key in a Dexie `kept` table, so rules never auto-ghostify it again (manual ghostifying still works). Rules apply only when AI is on; content scripts get feedgrab's proxy backend, never a model or key.
- D18: The embedding backfill runs by itself: when the service worker wakes, when settings change, and on a 5-minute alarm. It embeds one item at a time and only after the AI queue is empty, so new ghosts and searches go first. "Idle" means the extension's AI queue, not system CPU: no cross-browser API reports CPU load, and `chrome.idle` tracks user input. Progress is counted live from IndexedDB through a new `model` index on `embeddings` (Dexie v4), and the run state and last error are kept in `storage.session`. Each iteration reads storage, which keeps the MV3 service worker alive. If the worker is stopped anyway, the next alarm resumes the work.
- D19: Settings → AI model fields are dropdowns filled from each provider's list endpoint (`src/ai/catalog.ts`), with an "Other…" entry for any id and the old suggestions as a fallback when listing fails or finds nothing. Kinds come from what the API declares: Gemini `supportedGenerationMethods` (embedContent / generateContent), OpenRouter `architecture.output_modalities` (`embeddings` / `text` / `decisions`, fetched with `output_modalities=all`), Ollama `/api/show` `capabilities` (`embedding` / `completion` / `decision`, with a name guess for servers that send none). OpenAI's list has no type field, so its kinds come from the id. The Decision dropdown lists the provider's decision models first, when it has any, and then every chat model. Gemini and OpenAI declare no decision models today. If a provider adds them later (for example a Gemini method or a model id with "decision" in it), they show up without a code change. Routing is unchanged: only Ollama `d3*` models use `/v1/systemone`. Any other decision model goes through the chat path, and if that fails, through the general model.
- D20: The decision model goes through System One (`/v1/systemone`: `model`, `state`, typed `questions`) when its provider declares it a decision model. On Ollama that means `/api/show` lists the `decision` capability (d3, d1-omni), with a d3/Jev name guess for servers that report no capabilities. On OpenRouter it means the model list (`architecture.output_modalities` has `decisions`) marked the model when it was picked in Settings, saved as `ModelRef.systemOne` so the background never fetches the list; a typed id falls back to a Jev name match. The request goes to `https://openrouter.ai/api/v1/systemone` with the key (Jev). This replaces the d3-only name check. Settings → AI → Test sends one real System One question.
- D21: Decision answers are cached per item in a Dexie `decisions` table (v5), keyed by sha256 of [model tag, rules in order, item text], and kept for 30 days (pruned at most hourly). Only uncached items reach the model. A fully cached request makes no network call at all, not even the Ollama capability lookup. Fallback answers from the general model are cached under its own tag, so they never stand in for the decision model's answers. Changing the model or any rule changes the key, so items are asked again. The cache is per item, not per rule, because chat models return only the best-matching rule.
- D22: Tev1 (`tev1:0.8b`, `tev1:4b`; `tev1` is the 4B) is a supported Ollama decision model. It declares the `decision` capability, so D20 routing already sends it to `/v1/systemone`. It is added to the Ollama decision suggestions after d3 and to the decision-name guess for servers that report no capabilities. d3:2b stays the default.
- D23: All AI calls go through one queue (`src/background/ai-queue.ts`) that logs each job in a Dexie `aiJobs` table (v6). Each entry records its kind, label, model, prompt, input, output, error and timings, and the log keeps the last 300 jobs. Jobs run one at a time. Searches, rule checks, model tests and viewer requests go ahead of background work. Pausing a running job aborts its request (`AbortSignal`), and resuming starts it over, because model calls can't be resumed partway. Rule checks, searches and tests can't be paused, because a page is waiting for them, so pausing them stops them. While AI is paused (`local:aiPaused`, kept across restarts), they fail at once: feedgrab gets an error and searches fall back to keywords. Log entries left open when the service worker stops are closed as "Interrupted" on its next start.
- D24: Full content is fetched and parsed in the dashboard page, not the background, because MV3 service workers have no `DOMParser`. It is extracted with `@mozilla/readability`, sanitized with DOMPurify (no styles, forms or iframes, and links open in a new tab), and stored in a Dexie `contents` table with the item's digest and Q&A thread. The background reads only the text. Host access is requested per site (`permissions.request`) when the user clicks. The viewer doesn't embed the live page in an iframe, because most sites block framing (X-Frame-Options/CSP) and getting around that would mean stripping security headers. It offers the reader view, new tab or new window, and the viewer itself as a page (`dashboard.html#item=<key>`) instead. Reader tests run in jsdom, because happy-dom mishandles attributes and DOMPurify depends on them.
- D25: Prompts are settings (`ai.prompts`), each with a default and **Reset**. They cover summary and tags, Summarize, Ask, and the System One rule question (`{rule}` placeholder). Chat decision models keep feedgrab's built-in classify prompt, which Ghostify can't change. A custom rule question is added to the decision cache key, so answers are fetched again after it changes. Summarize and Ask stream with `streamText` and write partial text to IndexedDB every 150 ms, so the viewer updates live. They cut content at 24k characters to fit small local models.
- D26: Phase 5 (T24–T31, v1.2.0) comes from a full audit. Its fixes are D27–D30, and D31–D34 cover in-browser models.
- D27: Security. The background checks each message's sender (`src/background/guard.ts`):
  - Content scripts may call only `isGhosted`, `ghostify`, `autoGhostify`, `unghost` and `llm`, and only for their own page's host (`draft.host`, `key` prefix). Every other message must come from an extension page, so a page can't read the library, inject the picker or start AI jobs.
  - Drafts are clamped (title 300, excerpt 2000, author 120 characters, 500 ids per `isGhosted`), and `url`/`image` keep only http(s).
  - Imported sites need a plain hostname, and their rules must be `{ id, criteria, enabled }`.
  - The reader fetch accepts only http(s) HTML, at most 5 MB, within 20 s. It keeps `credentials: 'include'`, because reading pages you are logged in to is the point, and it goes only to origins you granted.
  - Ollama and provider model lists time out after 8 s.
  - The extension page CSP is set explicitly to `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` (needed for ONNX wasm; no remote code).
- D28: Performance:
  - `listItems` walks a new `[state+createdAt]` index (Dexie v7) and stops at `limit`.
  - Semantic search loads only the current model's vectors (`model` index).
  - The backfill computes its backlog once per run, not once per item.
  - Ollama capability lookups are memoized for 10 min.
  - Content scripts restart only when their own site's config or AI on/off changes, not on every settings write.
  - The login-view watcher throttles (one check per 300 ms) instead of debouncing, which never fired on pages that mutate all the time.
  - The ghost button repositions at most once per animation frame.
  - Dashboard lists render 50 cards at a time, with "Show more".
- D29: UI:
  - `useSettings` follows storage, so pages stop overwriting each other with stale copies.
  - The Ollama URL saves on blur, not on every keystroke.
  - Unghosting in the dashboard shows "Undo", which restores the item, its embedding and its content.
  - The viewer keeps its item when it leaves the filtered list.
  - Drawers move focus in and back out.
  - Deleting a site asks for confirmation.
  - Running jobs' durations tick.
- D30: The popup's compact cards open the original only when there is a link.
- D31: In-browser models are a new provider, `browser`. It runs Transformers.js (`@huggingface/transformers` 4.3.1, ONNX Runtime Web) on the CPU (WASM, 1 thread) or the GPU (WebGPU, chosen in Settings → AI). It is the default for all three purposes for new installs. Stored settings keep their provider. AI stays off until the user turns it on. Defaults:
  - embeddings `Xenova/all-MiniLM-L6-v2` (q8, ~23 MB);
  - general `HuggingFaceTB/SmolLM2-360M-Instruct` (q8, ~350 MB);
  - decision `Xenova/nli-deberta-v3-xsmall` (q8, ~85 MB).

  The alternatives are listed in `src/ai/browser/catalog.ts`. Any Hugging Face ONNX repo id can also be typed, and its task follows the purpose.
- D32: Model files are never bundled or committed:
  - The user downloads each model from Settings → AI. The files go to Cache Storage (`transformers-cache`, extension origin), and `local:browserModels` records `model@dtype` with its size.
  - Inference never downloads. The worker's `env.fetch` rejects Hugging Face requests unless a download for that model is running, and the background skips browser jobs for models that aren't downloaded (so the log doesn't fill with failures).
  - Delete removes the model's cached files and its records.
  - Only ONNX Runtime's asyncify wasm (~27 MB) ships with the extension. Vite bundles ORT's glue into the worker and emits the wasm as an asset; Transformers.js's CDN `wasmPaths` is cleared, because MV3 forbids remote code. `env.useWasmCache` is off, because its blob-URL import breaks the CSP. Loading a model takes roughly 10–15× its file size in RAM while it runs (wasm memory doesn't shrink), so the worker is ended when idle.
- D33: The runtime sits in a dedicated worker started by an unlisted `offscreen.html`:
  - Chrome hosts it as an offscreen document (`offscreen` permission, Chrome only; reason `WORKERS`), since MV3 service workers can't start workers. The background talks to it over a `runtime.connect` port.
  - Firefox's event page appends `offscreen.html` as an iframe and hands it a `MessageChannel` port.
  - The page only relays messages. After 10 idle minutes it ends the worker to free model memory, and the next call starts a new one.
  - Generation streams deltas and can be aborted (`InterruptableStoppingCriteria`). Downloads report `progress_total` into `session:browserDownloads`.
- D34: How browser models plug in:
  - They plug into the AI SDK as `LanguageModelV4` / `EmbeddingModelV4` adapters (`src/ai/browser/provider.ts`), so enrich, digest, Ask and feedgrab `detect` are unchanged.
  - For JSON output the adapter adds the schema to the system prompt, primes the reply with `{` and cuts the reply to the outermost object.
  - Browser decisions use zero-shot NLI (`zero-shot-classification`, `multi_label`, hypothesis "This item is about {}."). A rule matches at score ≥ 0.7, which maps to the same `ClassifyResponse` as System One, cached under its model tag.
  - The text the AI reads is cut to 6k characters for browser models (vs 24k), to keep CPU prefill time reasonable.
- D35: Built-in feed selectors are refreshed from the shipped defaults on install, update and startup (`ensureDefaultSites`), matched by feed id. Only `container` and `item` change; enabled state, rules and removed or picked pages are kept. This lets selector fixes (such as dev.to's `div.paged-stories` infinite-scroll wrapper) reach existing installs.
- D36: Hover ghost effects stay in the shadow root (D1): the button rises in, a fixed `.aura` overlay over the item's rect haunts it while the button is hovered, and on click the aura mists over (320 ms), `removeItem` runs, then the mist lifts off the reflowed feed (420 ms). Reduced motion skips the animations and delays.
- D37: After the extension reloads, already-open tabs keep an orphaned content script (Chrome does not re-inject, so WXT `ctx.onInvalidated` never fires). The runtime takes `alive()` (`browser.runtime.id` present) and treats "Extension context invalidated" errors the same way: the button stops showing and a single toast offers **Reload**.
- D38: dev.to infinite scroll appends each page's `div.paged-stories` inside the previous one (verified live: 13+ levels deep after scrolling, later items are `article.crayons-story`), so the `devto-stories` item selector is the descendant `:scope .crayons-story` instead of fixed-depth child selectors. Click-through and back is client-side navigation, handled by the existing `wxt:locationchange` restart; D35 delivers the new selector to existing installs.
- D39: Fix: dev.to feed items were never ghostifiable when logged in (the built-in site shipped only logged-out profiles). The login indicator is `#nav-profile-image` (present = logged in), and `/`, `/latest` and `/top/*` get a `devto-stories-logged-in` feed (container `#rendered-article-feed, #rendered-article-feed .paged-stories`, item `:scope > article`). Stored built-in sites still on the old `body[data-user-status="logged-in"]` indicator are migrated once by `ensureDefaultSites`: the indicator is replaced and missing logged-in profiles are added; afterwards, removed logged-in pages stay removed and D35 keeps refreshing the selectors.
- D40: Fix: logged-in dev.to only worked on `/`. The logged-in view now ships `/`, `/discover`, `/following`, `/following/latest`, `/curated`, `/latest`, `/latest_less_filtered` and `/top/*` (same `devto-stories-logged-in` feed). Built-in sites record the shipped pages they were given (`shippedPages`, keyed `view:path`); `ensureDefaultSites` adds shipped pages not in that record once, so updates reach existing installs while pages the user removed stay removed. Installs without a record get every missing shipped page once. The legacy-indicator migration (D39) now only swaps the indicator, and importing over a built-in site keeps its record.
