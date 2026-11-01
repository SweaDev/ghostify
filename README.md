# Ghostify

Ghostify is a browser extension (Chrome and Firefox) for feeds that keep showing you the same posts. Hover a post, click the ghost, and it disappears from the site's feed for good. Ghostify keeps a copy so you can find it again later.

> **Status: v0.1.0 (Phase 1 of 4).** Ghostify works on the dev.to home feeds (logged out). See [What's missing](#whats-missing).

## Features in this version
- **The dev.to logged-out home feeds** (Relevant `/`, Latest `/latest`, Top `/top/*`) are recognized automatically, through [feedgrab](https://github.com/SweaDev/feedgrab).
- **The ghost button** shows on the post under your pointer. Clicking it hides the post and saves it, and an **Undo** toast lets you take it back.
- **Ghosted posts stay hidden** when you reload, and also when they come back later through infinite scroll.
- **The popup** lists your ghosted posts (newest first). From there you can open one, or **unghost** it so it shows on the site again.
- Everything stays local in your browser (IndexedDB), with no account and no sync.

## Install a release
1. Download a zip from [Releases](https://github.com/SweaDev/ghostify/releases):
   - `ghostify-<version>-chrome.zip` for Chrome, Edge or Brave;
   - `ghostify-<version>-firefox.zip` for Firefox.
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
```

Load the build unpacked:
- **Chrome**: on `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox**: on `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `.output/firefox-mv3/manifest.json`.

Then open <https://dev.to/> while logged out, hover a post, and click the ghost.

### Development
| Command | What it does |
|---|---|
| `bun run dev` / `bun run dev:firefox` | Opens a browser with the extension and hot reload |
| `bun run zip` / `bun run zip:firefox` | Builds the release zips into `.output/` (Firefox also gets a sources zip) |
| `bun run zip:newtab` / `bun run zip:newtab:firefox` | Builds the zips for the new-tab flavor (its page arrives in Phase 2) |
| `bun run test` | Runs the unit tests (Vitest) |
| `bun run lint` / `bun run format` | Runs Biome |
| `bun run typecheck` | Runs the TypeScript checks |
| `bun run check` | Runs lint, typecheck and test together |

### Releases
Pushing a `v*` tag runs `.github/workflows/release.yml`. It tests the extension, builds the Chrome, Firefox and Firefox sources zips for both flavors, and attaches them to a GitHub Release:

```sh
git push origin v0.1.0
```

## Project docs
- The spec is `specs/SPEC-v1.md`, the plan is `specs/PLAN-v1.md`, and the tasks are `specs/TASKS-v1.md`.
- This version covers tasks **T01–T07** (Phase 1) and these parts of the spec:
  - feedgrab feed reading;
  - the dev.to logged-out home feeds;
  - the ghost icon on recognized items;
  - removing ghosted items from the feed and keeping them in the extension.

## What's missing
| Coming in | What |
|---|---|
| Phase 2 | A full Ghostify page (Ghosted, Later and Snoozed tabs), snooze, search and filters, and the new-tab flavor |
| Phase 3 | Adding sites and custom selectors through the feedgrab overlay, and separate logged-in and logged-out views |
| Phase 4 | Local AI with Ollama (summaries, tags, semantic search, auto-ghostify rules) and bring-your-own-key OpenRouter, Gemini and OpenAI |

## License
MIT
