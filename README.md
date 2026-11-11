# Ghostify

Ghostify is a browser extension (Chrome and Firefox) for feeds that keep showing you the same posts, or posts you probably want to deal with later. Hover a post, click the ghost, and it disappears from the site's feed. Ghostify keeps a copy so you can find them again later, snooze them, read later, run AI models on them, and many more interesting features are coming up!

## Updates
Latest: [**v1.7.0**](https://github.com/SweaDev/ghostify/tree/v1.7.0) ([release](https://github.com/SweaDev/ghostify/releases/tag/v1.7.0)) | [DEV Challenge Submission](https://dev.to/fm/from-a-simple-mark-as-seen-to-feedgrab-ghostify-story-of-my-life-33dl) Entry: [**v1.0.0**](https://github.com/SweaDev/ghostify/tree/v1.0.0) ([release](https://github.com/SweaDev/ghostify/releases/tag/v1.0.0)) 

- Pick a typical sample post and the parts every post has; the ghost button skips ads and headings that lack them (v1.7).
- Choose which query parameters of a post link identify the post, e.g. YouTube's `v` but not `pp` (v1.6).
- In-browser AI models keep working after one fails to load (v1.5.2).
- Sort your ghosts by date, relevance or at random, ascending or descending; the choice is remembered (v1.5.1).
- Choose which link identifies a post (x.com posts keep their own URL), and check selector edits against a saved sample of each feed (v1.5).
- Edit any site's page selectors by hand, and restore built-in sites to how Ghostify ships them (v1.4.5).
- Move the ghost button to any corner of a post, for all sites or per site (v1.4).
- dev.to works logged in on every home tab (v1.3).
- AI runs in your browser by default, with no GPU, Ollama or API key needed (v1.2).
- Read full posts and ask AI about them in the viewer; every AI job can be paused or stopped (v1.1).

See [CHANGELOG.md](CHANGELOG.md) for every release.

## Features
- **The dev.to home feeds, logged in or out** (Relevant `/`, Latest `/latest`, Top `/top/*`, and when logged in also `/discover`, `/following`, `/following/latest`, `/curated` and `/latest_less_filtered`) are recognized automatically, through [feedgrab](https://github.com/SweaDev/feedgrab).
- **The ghost button** shows on the post under your pointer. Clicking it hides the post and saves it, and an **Undo** toast lets you take it back. If it covers something on a site, move it in **Settings → Appearance** to any corner of the post, with its distance from the edges in px, for all sites or just one.
- **Ghostified posts stay hidden** when you reload, and also when they come back later through infinite scroll.
- **The popup** lists your recent ghosts. From there you can open one, **unghostify** it so it shows on the site again, or open the full Ghostify page.
- **The Ghostify page** has three tabs:
  - **Ghostified** is everything you hid.
  - **Later** is what you want to read.
  - **Snoozed** holds posts that come back later.
- **Snooze** a post until later today, tomorrow, the weekend, next week, or a date you choose. The post stays hidden on the site, and when the time is up it shows in **Back from snooze** at the top of Ghostified.
- **Search** your ghosts by keyword and **filter** them by site. **Sort** them by date ghostified or relevance (to the search; by date without one), descending, ascending or random (**Shuffle again** reshuffles); the choice is remembered. Long lists load 50 at a time (**Show more**), and **Unghostify** on the Ghostify page has an **Undo**.
- **The viewer** opens when you click a post's title, thumbnail or excerpt. It has three tabs:
  - **Overview**: the summary, tags and excerpt.
  - **Reader**: **Load full content** fetches the post and shows its main text inside Ghostify, without the site's ads and menus (the first time, you're asked to allow access to that site). **Reload** fetches it again.
  - **Ask AI**: **Summarize** the full content, or ask your own questions about it. Answers stream in as they're written, and each one can be paused, resumed or stopped.

  Toolbar buttons open the original post in a new tab or a new window, open the viewer as its own page (which you can also move to a new window), or widen the panel. The popup can open Ghostify in a new window.
- **Add any site.** On a page with a feed, open the popup and click **Add this site**. Ghostify asks for access to that site only, and then:
  1. [feedgrab](https://github.com/SweaDev/feedgrab) proposes the feeds on the page, and its overlay lets you confirm them, pick containers and items, or type CSS/XPath selectors.
  2. You step to a typical **sample post** (the first item can be an ad or a heading), then choose which of its links opens a post, and which of the link's query parameters identify the post. Untick tracking or analytics ones (like YouTube's `pp` in `watch?pp=…&v=…`) so the same post is recognised every time.
  3. You choose the **post structure**: the parts of the sample post every post has (time link, text, action buttons, …). Ghostify suggests which are required and which optional (a thumbnail only some posts have), shows how many items match and outlines the rest. The ghost button only appears on items with every required part, so ads and headings that share the item selector are skipped. When you edit a site again, the sample post starts at the first post with that structure.
  4. You choose which page paths the feeds apply to.
  5. You choose whether they're for the **logged-in**, the **logged-out** or **any** view. For a specific view, you can pick an element that only shows in it (for example your avatar), so Ghostify can tell the views apart.

  **Edit selectors** in the popup reopens the overlay on a site you already added.
- **Settings → Sites** lists your sites with a search box, and each site opens on its own page (with a breadcrumb back to the list). It lets you:
  - turn sites on or off and delete the ones you added;
  - see and edit each page's path pattern, view, selectors, post link with its query parameters, and post structure (required and optional parts, or suggested from the saved sample); edits are checked against a saved sample of each feed, and edited built-in selectors are kept over Ghostify's updates;
  - restore a built-in site, or one edited built-in page, to how Ghostify ships it;
  - edit the login indicator;
  - export and import your sites as JSON.

  dev.to is built in. Its login indicator is `#nav-profile-image`, and its home feeds are set up for both the logged-in and logged-out views.
- **The view switches** as soon as you log in or out, without a reload.
- **The new-tab flavor** (`ghostify-newtab-*` zips) puts the Ghostify page on every new tab. Install either the regular flavor or the new-tab flavor, not both.
- **AI is optional and off by default.** Turn it on in **Settings → AI** and download the in-browser models (or pick another provider) to get:
  - **summaries and tags** for each ghostified post, written by the general model. Click a tag to filter by it.
  - **semantic search**: turn on **Semantic** next to the search box and describe what you remember.
  - **summaries of the full content and answers to your questions** in the viewer's **Ask AI** tab;
  - **auto-ghostify rules**: in **Settings → Sites**, write plain-language rules per site, such as "crypto hype" or "posts that are mostly self-promotion". The decision model checks new feed items against them and ghostifies the matches. Auto-ghostified posts are labelled with their rule. **Not this** brings a post back, and that rule never hides it again.
- **AI activity** (the pulse button in the Ghostify page header, or **Settings → AI activity**) lists every AI request: summaries, tags, indexing, rule checks, searches, model tests and questions. Expand a row to see its model, prompt, input, output and error. Each job can be paused, resumed or stopped, and **Pause all**, **Resume all** and **Stop all** act on everything at once. A pause lasts across browser restarts. While AI is paused, searches fall back to keywords and auto-ghostify rules don't run.
- **Settings → Prompts** lets you change what Ghostify asks the AI: the summary-and-tags prompt, the **Summarize** and **Ask** prompts, and the rule question sent to System One decision models. **Reset to default** restores the original prompt.
- Everything stays local in your browser (IndexedDB), with no account and no sync. With in-browser models or Ollama, AI stays on your machine too.

## AI setup
Each purpose (embeddings, general model, decision model) can use its own provider and model.

### In your browser (default)
Small open models run inside the browser with [Transformers.js](https://huggingface.co/docs/transformers.js) (ONNX Runtime Web). They need no GPU, no Ollama and no API key. No model ships with the extension and nothing downloads on its own: you choose what to download.

| Purpose | Default model | Download (CPU) | Alternatives |
|---|---|---|---|
| Embeddings (semantic search) | [MiniLM L6](https://huggingface.co/Xenova/all-MiniLM-L6-v2) | ~23 MB | BGE small (~34 MB), multilingual MiniLM L12 (~118 MB) |
| General (summaries, tags, Ask) | [SmolLM2 360M Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) | ~350 MB | SmolLM2 135M (~135 MB, for low-memory computers), Gemma 3 270M (~315 MB), Qwen2.5 0.5B (~495 MB) |
| Decision (auto-ghostify rules) | [DeBERTa v3 xsmall NLI](https://huggingface.co/Xenova/nli-deberta-v3-xsmall) | ~85 MB | MobileBERT MNLI (~26 MB) |

1. Open **Settings → AI** and turn on **Use AI**.
2. Click **Download** on each row, or **Download all** (about 460 MB for the defaults). The files come from Hugging Face once and stay in the browser's cache. Progress shows on each row, and downloads keep going if you close the settings page.
3. Click **Test** on each row. **Delete** removes a model's files.
4. Optional: under **In-browser models**, pick **GPU (WebGPU)** instead of **CPU** if your browser supports WebGPU. It is faster, but uses different model files, so download again.

Any Hugging Face ONNX repo works too: choose **Other…** in the model list and type its id (`owner/name`).

How it works and what to expect:
- Models run in a worker on an offscreen page (Chrome) or a hidden frame of the background page (Firefox). They stop after 10 idle minutes to free memory.
- A model needs roughly 10–15 times its file size in RAM while it runs. On a computer with 4 GB of RAM, choose SmolLM2 135M.
- Summaries take a few seconds per post on a laptop CPU. The viewer reads at most 6,000 characters of an article with in-browser models (24,000 with others).
- Rule checks use a zero-shot classifier ("This item is about …"), not a chat model. Short topics such as "crypto hype" or "an advertisement" work much better than long descriptions. The rule question in **Settings → Prompts** applies only to System One models.

### Local with Ollama
| Purpose | Default model |
|---|---|
| Embeddings (semantic search) | [`embeddinggemma-2`](https://ollama.com/library/embeddinggemma-2) |
| General (summaries, tags) | [`gemma4:e2b`](https://ollama.com/library/gemma4) |
| Decision (auto-ghostify rules) | [`d3:2b`](https://ollama.com/library/d3) (needs Ollama 0.40.9 or later) |

Any Ollama model with the `decision` capability (for example [`tev1:0.8b` or `tev1:4b`](https://ollama.com/library/tev1), or [`d1-omni`](https://ollama.com/library/d1-omni)) works as the decision model. So does an OpenRouter decision model such as [Jev](https://openrouter.ai/docs/guides/community/jev) (`typesafe/jev-1.14`). Ghostify sends these models System One requests (`/v1/systemone`); any other model gets a chat prompt.

1. Pull the models:
   ```sh
   ollama pull embeddinggemma-2
   ollama pull gemma4:e2b
   ollama pull d3:2b
   ```
2. Let Ollama accept requests from browser extensions. Without this step, the browser console shows a CORS error. Set `OLLAMA_ORIGINS` on the Ollama server that is actually running. If you changed the Ollama URL in Settings, set `OLLAMA_HOST` to the same host and port.
   - **Linux:** the installer runs Ollama as a systemd service, so setting the variable in a terminal has no effect. Run `sudo systemctl edit ollama` and add:
     ```ini
     [Service]
     Environment="OLLAMA_HOST=127.0.0.1:11434"
     Environment="OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*"
     ```
     Then run `sudo systemctl restart ollama`.
   - **macOS:** run the commands below, then quit and reopen the Ollama app:
     ```sh
     launchctl setenv OLLAMA_HOST "127.0.0.1:11434"
     launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,moz-extension://*"
     ```
   - **Windows:** add `OLLAMA_HOST` and `OLLAMA_ORIGINS` as user environment variables, then quit Ollama from the tray and start it again.
   - **No background service:** run
     ```sh
     OLLAMA_HOST=127.0.0.1:11434 OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
     ```

   To check, run `curl -i -H "Origin: chrome-extension://x" http://127.0.0.1:11434/api/tags`. A `403` response means the running server didn't pick up `OLLAMA_ORIGINS`.
3. In **Settings → AI**:
   1. Turn on **Use AI**.
   2. Click **Test** on each row.
   3. Wait for **Search index** to fill. Ghosts saved before AI was on, or before you changed the embedding model, are embedded in the background, one at a time, whenever no other AI work is waiting. The card shows how many are done, the estimated time left, and why indexing paused (for example, Ollama isn't running). It retries every 5 minutes.

### Bring your own key
1. Pick **OpenRouter**, **Gemini** or **OpenAI** for any purpose. The model box suggests models, and you can type any model id.
2. Paste the key into **API keys**.

Keys are stored only in the extension's own storage and sent only to that provider. Content scripts on the sites you visit never see them.

If the decision model fails (for example, Ollama isn't running), the general model handles the rule check instead. If embeddings fail, search falls back to keywords.

## Install a release
1. Download a zip from [Releases](https://github.com/SweaDev/ghostify/releases):
   - `ghostify-<version>-chrome.zip` for Chrome, Edge or Brave;
   - `ghostify-<version>-firefox.zip` for Firefox;
   - `ghostify-newtab-<version>-chrome.zip` or `ghostify-newtab-<version>-firefox.zip` if you want Ghostify on every new tab.
2. **Chrome**:
   1. Unzip the file.
   2. Open `chrome://extensions` and turn on **Developer mode**.
   3. Click **Load unpacked** and select the unzipped folder.
3. **Firefox**:
   1. Open `about:debugging#/runtime/this-firefox`.
   2. Click **Load Temporary Add-on…** and select the zip file, or its `manifest.json` after unzipping.
   3. Firefox removes temporary add-ons when it restarts.

## Build from source
Requires [Bun](https://bun.sh) 1.3 or later.

```sh
bun install
bun run build           # Chrome  → .output/chrome-mv3
bun run build:firefox   # Firefox → .output/firefox-mv3

# New-tab flavor (optional)
bun run build:newtab           # → .output/chrome-mv3-newtab
bun run build:newtab:firefox   # → .output/firefox-mv3-newtab
```

Load the build unpacked:
- **Chrome**: on `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox**: on `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `.output/firefox-mv3/manifest.json`.

For the new-tab flavor, load `.output/chrome-mv3-newtab` or `.output/firefox-mv3-newtab/manifest.json` the same way.

Then:
1. Open <https://dev.to/>, hover a post, and click the ghost.
2. Click the Ghostify toolbar icon, then **Open Ghostify**. If you use the new-tab flavor, open a new tab instead.
3. To try another site, open it, click the toolbar icon and choose **Add this site**.
4. Optional: set up AI (see [AI setup](#ai-setup)).

### Development
| Command | What it does |
|---|---|
| `bun run dev` / `bun run dev:firefox` | Opens a browser with the extension and hot reload |
| `bun run zip` / `bun run zip:firefox` | Builds the release zips into `.output/` (Firefox also gets a sources zip) |
| `bun run zip:newtab` / `bun run zip:newtab:firefox` | Builds the zips for the new-tab flavor |
| `bun run test` | Runs the unit tests (Vitest) |
| `bun run lint` / `bun run format` | Runs Biome |
| `bun run typecheck` | Runs the TypeScript checks |
| `bun run check` | Runs lint, typecheck and test together |

### Releases
Pushing a `v*` tag runs `.github/workflows/release.yml`. It tests the extension, builds the Chrome, Firefox and Firefox sources zips for both flavors, and attaches them to a GitHub Release:

```sh
git push origin v1.0.0
```

## Project docs
- The spec is `specs/SPEC-v1.md`, the plan is `specs/PLAN-v1.md`, and the tasks are `specs/TASKS-v1.md`.
- This version covers every task, **T01–T31** (Phases 1–5), and all of the spec:
  - feedgrab feed reading;
  - the dev.to home feeds (logged in and out), plus adding more sites;
  - custom feed selectors through feedgrab;
  - separate logged-in and logged-out views with their own selectors;
  - the ghost icon on recognized items;
  - removing ghostified items from the feed and keeping them in the extension;
  - viewing later, snoozing, and the Ghostified tab until you remove an item;
  - keyword filtering;
  - the UI;
  - the new-tab option (as a build flavor);
  - local Ollama models (embeddinggemma-2, Gemma 4 E2B, d3:2b) and bring-your-own-key OpenRouter, Gemini and OpenAI, configurable per purpose.
- Phase 5 (T24–T31) came out of a security, performance and UI audit, and added in-browser models:
  - security: the background accepts only the feed messages from web pages, and only about that page's site. Saved posts keep only http(s) links, and their text is capped. Imported sites are validated. Full-content loads are limited to 5 MB of HTML within 20 s. Model lists time out. The extension's content security policy allows no remote code;
  - performance: indexed, limited item lists; search reads only the current model's vectors; a single backlog per indexing run; fewer content-script restarts; a throttled login-view watcher; and a ghost button placed once per frame;
  - UI: Undo for unghostifying, paged lists, a viewer that stays open when its post moves tabs, settings that stay in sync across pages, focus handling for drawers, and a confirmation before deleting a site;
  - in-browser models, which are now the default AI provider (see [AI setup](#ai-setup)).

## Known limits
- Ghostify isn't published to the Chrome Web Store or Firefox Add-ons. Install it from a release zip or a local build.
- Decision models get one yes/no (`noul`) System One question per rule. Ghostify reads the documented `{ "noul": <probability> }` answer and a few lenient variants (see `src/ai/decision.ts`). It treats anything else as "no match" and logs it.
- **Load full content** shows what the page sends to Ghostify, using your cookies for that site. Pages built entirely in the browser by scripts may have little readable text. In that case, open the original.
- Pausing a job that is already running stops its request, and **Resume** starts it again from the beginning. Rule checks and searches can't be paused, because a page is waiting for them, so pausing them stops them.
- Data isn't synced between browsers. To move your sites, use export and import in **Settings → Sites**.
- In-browser models are small: summaries are plainer than those from larger models, and the smallest chat models sometimes leave out tags. They run on one CPU thread, because extension pages aren't cross-origin isolated. The extension includes ONNX Runtime's WebAssembly (about 27 MB).

## Permissions
| Permission | Why |
|---|---|
| `storage` | Settings and sites |
| `alarms` | Waking snoozed posts |
| `scripting` | Running Ghostify on sites you add |
| `activeTab` | Reading the current tab's address in the popup, and opening the site picker |
| `offscreen` (Chrome only) | Running the in-browser AI models in a worker (Chrome's background can't start workers) |
| dev.to | The built-in site |
| Other sites (optional) | Requested for one site at a time, when you add it or load a post's full content |

## License
MIT

The extension icon is the 👻 glyph from [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache-2.0).
