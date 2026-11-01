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
