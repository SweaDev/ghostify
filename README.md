# Ghostify

Ghostify is a browser extension (Chrome and Firefox) for feeds that keep showing you the same posts. Hover a post, click the ghost, and it disappears from the site's feed for good. Ghostify keeps a copy so you can find it again later.

> **Status: v0.3.0 (Phase 3 of 4).** Ghostify works on the dev.to home feeds out of the box, and you can add any site. It has a full Ghostify page with snooze and search. See [What's missing](#whats-missing).

## Features in this version
- **The dev.to logged-out home feeds** (Relevant `/`, Latest `/latest`, Top `/top/*`) are recognized automatically, through [feedgrab](https://github.com/SweaDev/feedgrab).
- **The ghost button** shows on the post under your pointer. Clicking it hides the post and saves it, and an **Undo** toast lets you take it back.
- **Ghosted posts stay hidden** when you reload, and also when they come back later through infinite scroll.
- **The popup** lists your recent ghosts. From there you can open one, **unghost** it so it shows on the site again, or open the full Ghostify page.
- **The Ghostify page** has three tabs:
  - **Ghosted** is everything you hid.
  - **Later** is what you want to read.
  - **Snoozed** holds posts that come back later.
- **Snooze** a post until later today, tomorrow, the weekend, next week, or a date you choose. The post stays hidden on the site, and when the time is up it shows in **Back from snooze** at the top of Ghosted.
- **Search** your ghosts by keyword, **filter** them by site, and click a thumbnail or excerpt to see the post's details.
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
- Everything stays local in your browser (IndexedDB), with no account and no sync.

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
git push origin v0.3.0
```

## Project docs
- The spec is `specs/SPEC-v1.md`, the plan is `specs/PLAN-v1.md`, and the tasks are `specs/TASKS-v1.md`.
- This version covers tasks **T01–T17** (Phases 1–3) and these parts of the spec:
  - feedgrab feed reading;
  - the dev.to logged-out home feeds, plus adding more sites;
  - custom feed selectors through feedgrab;
  - separate logged-in and logged-out views with their own selectors;
  - the ghost icon on recognized items;
  - removing ghosted items from the feed and keeping them in the extension;
  - viewing later, snoozing, and the Ghostified tab until you remove an item;
  - keyword filtering;
  - the UI;
  - the new-tab option (as a build flavor).

## What's missing
| Coming in | What |
|---|---|
| Phase 4 | Local AI with Ollama (summaries, tags, semantic search, auto-ghostify rules) and bring-your-own-key OpenRouter, Gemini and OpenAI |

## Permissions
| Permission | Why |
|---|---|
| `storage` | Settings and sites |
| `alarms` | Waking snoozed posts |
| `scripting` | Running Ghostify on sites you add |
| `activeTab` | Reading the current tab's address in the popup, and opening the site picker |
| dev.to | The built-in site |
| Other sites (optional) | Requested for one site at a time when you add it |

## License
MIT
