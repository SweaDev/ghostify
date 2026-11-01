# Ghostify

Ghostify is a browser extension (Chrome and Firefox) for feeds that keep showing you the same posts. Hover a post, click the ghost, and it disappears from the site's feed for good. Ghostify keeps a copy so you can find it again later.

> **v1.0.0.** Ghostify works on the dev.to home feeds out of the box, and you can add any site. It has a full Ghostify page with snooze and search, and optional AI that runs locally with Ollama or with your own OpenRouter, Gemini or OpenAI key.

## Features
- **The dev.to logged-out home feeds** (Relevant `/`, Latest `/latest`, Top `/top/*`) are recognized automatically, through [feedgrab](https://github.com/SweaDev/feedgrab).
- **The ghost button** shows on the post under your pointer. Clicking it hides the post and saves it, and an **Undo** toast lets you take it back.
- **Ghosted posts stay hidden** when you reload, and also when they come back later through infinite scroll.
- **The popup** lists your recent ghosts. From there you can open one, **unghost** it so it shows on the site again, or open the full Ghostify page.
- **The Ghostify page** has three tabs:
  - **Ghosted** is everything you hid.
  - **Later** is what you want to read.
  - **Snoozed** holds posts that come back later.
- **Snooze** a post until later today, tomorrow, the weekend, next week, or a date you choose. The post stays hidden on the site, and when the time is up it shows in **Back from snooze** at the top of Ghosted.
- **Search** your ghosts by keyword and **filter** them by site.
- **The viewer** opens when you click a post's title, thumbnail or excerpt. It has three tabs:
  - **Overview**: the summary, tags and excerpt.
  - **Reader**: **Load full content** fetches the post and shows its main text inside Ghostify, without the site's ads and menus (the first time, you're asked to allow access to that site). **Reload** fetches it again.
  - **Ask AI**: **Summarize** the full content, or ask your own questions about it. Answers stream in as they're written, and each one can be paused, resumed or stopped.

  Toolbar buttons open the original post in a new tab or a new window, open the viewer as its own page (which you can also move to a new window), or widen the panel. The popup can open Ghostify in a new window.
- **Add any site.** On a page with a feed, open the popup and click **Add this site**. Ghostify asks for access to that site only, and then:
  1. [feedgrab](https://github.com/SweaDev/feedgrab) proposes the feeds on the page, and its overlay lets you confirm them, pick containers and items, or type CSS/XPath selectors.
  2. You choose which page paths the feeds apply to.
  3. You choose whether they're for the **logged-in**, the **logged-out** or **any** view. For a specific view, you can pick an element that only shows in it (for example your avatar), so Ghostify can tell the views apart.

  **Edit selectors** in the popup reopens the overlay on a site you already added.
- **Settings → Sites** lets you:
  - turn sites on or off and delete the ones you added;
  - see each page pattern, its view and its selectors;
  - edit the login indicator;
  - export and import your sites as JSON.

  dev.to is built in. Its login indicator is `body[data-user-status="logged-in"]`, and only its logged-out home feeds are set up. Add the logged-in view yourself with **Edit selectors** if you want it.
- **The view switches** as soon as you log in or out, without a reload.
- **The new-tab flavor** (`ghostify-newtab-*` zips) puts the Ghostify page on every new tab. Install either the regular flavor or the new-tab flavor, not both.
- **AI is optional and off by default.** Turn it on in **Settings → AI** to get:
  - **summaries and tags** for each ghosted post, written by the general model. Click a tag to filter by it.
  - **semantic search**: turn on **Semantic** next to the search box and describe what you remember.
  - **summaries of the full content and answers to your questions** in the viewer's **Ask AI** tab;
  - **auto-ghostify rules**: in **Settings → Sites**, write plain-language rules per site, such as "posts that are mostly self-promotion". The decision model checks new feed items against them and ghosts the matches. Auto-ghosted posts are labelled with their rule. **Not this** brings a post back, and that rule never hides it again.
- **AI activity** (the pulse button in the Ghostify page header, or **Settings → AI activity**) lists every AI request: summaries, tags, indexing, rule checks, searches, model tests and questions. Expand a row to see its model, prompt, input, output and error. Each job can be paused, resumed or stopped, and **Pause all**, **Resume all** and **Stop all** act on everything at once. A pause lasts across browser restarts. While AI is paused, searches fall back to keywords and auto-ghostify rules don't run.
- **Settings → Prompts** lets you change what Ghostify asks the AI: the summary-and-tags prompt, the **Summarize** and **Ask** prompts, and the rule question sent to System One decision models. **Reset to default** restores the original prompt.
- Everything stays local in your browser (IndexedDB), with no account and no sync. With Ollama, AI stays on your machine too.

## AI setup
Each purpose (embeddings, general model, decision model) can use its own provider and model.

### Local with Ollama (default)
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
1. Open <https://dev.to/> while logged out, hover a post, and click the ghost.
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
- This version covers every task, **T01–T23** (Phases 1–4), and all of the spec:
  - feedgrab feed reading;
  - the dev.to logged-out home feeds, plus adding more sites;
  - custom feed selectors through feedgrab;
  - separate logged-in and logged-out views with their own selectors;
  - the ghost icon on recognized items;
  - removing ghosted items from the feed and keeping them in the extension;
  - viewing later, snoozing, and the Ghostified tab until you remove an item;
  - keyword filtering;
  - the UI;
  - the new-tab option (as a build flavor);
  - local Ollama models (embeddinggemma-2, Gemma 4 E2B, d3:2b) and bring-your-own-key OpenRouter, Gemini and OpenAI, configurable per purpose.

## Known limits
- Ghostify isn't published to the Chrome Web Store or Firefox Add-ons. Install it from a release zip or a local build.
- dev.to has only its logged-out home feeds built in.
- Decision models get one yes/no (`noul`) System One question per rule. Ghostify reads the documented `{ "noul": <probability> }` answer and a few lenient variants (see `src/ai/decision.ts`). It treats anything else as "no match" and logs it.
- **Load full content** shows what the page sends to Ghostify, using your cookies for that site. Pages built entirely in the browser by scripts may have little readable text. In that case, open the original.
- Pausing a job that is already running stops its request, and **Resume** starts it again from the beginning. Rule checks and searches can't be paused, because a page is waiting for them, so pausing them stops them.
- Data isn't synced between browsers. To move your sites, use export and import in **Settings → Sites**.

## Permissions
| Permission | Why |
|---|---|
| `storage` | Settings and sites |
| `alarms` | Waking snoozed posts |
| `scripting` | Running Ghostify on sites you add |
| `activeTab` | Reading the current tab's address in the popup, and opening the site picker |
| dev.to | The built-in site |
| Other sites (optional) | Requested for one site at a time, when you add it or load a post's full content |

## License
MIT
