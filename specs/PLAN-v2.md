# Ghostify v2: Plan

Spec: `specs/SPEC-v2.md`. Tasks: `specs/TASKS-v2.md`. feedgrab work: `../feedgrab/spec/TASKS-02.md` (T41–T54).

## Data model (Dexie v9)
```ts
type ContentKind = 'post' | 'image' | 'video' | 'audio' | 'pdf';     // feedgrab
interface GhostItem {                                                 // v1 fields, plus:
  kind?: ContentKind;            // unset = post (items from before v2)
  publishedAt?: string;          // ISO 8601
  images?: ImageInfo[];          // feedgrab, at most 8, http(s) only
  media?: MediaInfo;             // feedgrab playable attributes, http(s) only
  html?: string;                 // feedgrab's in-feed content HTML (posts, images), at most 20 KB
}
// thumbs: { key, blob (≤ 64 KB, webp/jpeg), width, height, at }
```
- `items` gets a `kind` index. Old rows need no rewrite: a missing `kind` reads as `post`.
- `html` is stored as feedgrab cleans it and is **sanitized with DOMPurify when rendered** (extension pages only), like the reader content (D24). MV3 service workers have no DOM to sanitize in.
- Backups include the new fields; full snapshots include `thumbs`.

## Modules
| Module | Change |
|---|---|
| `src/feed/extract.ts` | Thin mapping from `item.content()` to a `GhostDraft`: title (else text, else "Untitled"), excerpt = start of `text`, `image` = poster or first image, plus kind, publishedAt, images, media, html. No extraction logic of its own. |
| `src/sites/defaults.ts` | dev.to feeds declare `content: { type: 'post', fields: { author } }` (its author selector moved from Ghostify's extractor to a field rule). |
| `src/background/guard.ts` | Clamps and URL checks for the new draft fields. |
| `src/store/items.ts` | `ListQuery.kind`. |
| `src/ui/ItemCard.tsx`, `FilterBar.tsx` | Kind badge, duration chip, Kind filter. |
| `src/sites/selector.ts` | Removed; `generateSelector` from feedgrab. |
| `src/sites/links.ts` `checkFeed` | Replaced by feedgrab `checkDescriptor`. |
| `src/store/thumbs.ts`, `src/background/thumbs.ts` | Thumbnail fetch + resize (`createImageBitmap` + `OffscreenCanvas`), host permission for the image host requested at grab time. |
| `src/ui/viewers/*` | `PostView`, `ImageView`, `VideoView`, `AudioView`, `PdfView`; `ItemDetail` picks one by kind. Provider players in iframes; a refused embed (load error or a timeout) offers **Play on site** (`windows.create({ type: 'popup' })`). |
| `src/grab/*`, `entrypoints/grab/` | Grab panel: page agent in the picker content script (feedgrab headless: detect, describe, pick, highlight, scroll) and a React page `grab.html` that connects with `tabs.connect`; docked in an iframe (web-accessible, one-time token) or in a popup window; dock side and size in `local:grabDock`. Replaces the link, structure and view choosers, `panel.ts`, `highlight.ts` and the `openOverlay` step. |

## Releases
| Tag | Needs feedgrab | Contents |
|---|---|---|
| v1.10.0 | v0.7.0 | Data model, extraction via `content()`, kind badge and filter, duplicate code removed |
| v1.11.0 | v0.6.0 | Viewers and players, thumbnails |
| v1.12.0 | v0.7.0 | Grab panel (docked and popped out), Settings → Sites content editing |
| v2.0.0 | v0.8.0 | Item pages through `feedgrab/page`, docs |

## Decisions
- E1: Releases build only from `main`. When a Ghostify tag needs a new feedgrab release and the session isn't pushing to `main`, the agent asks the user to push feedgrab's `main` and tag; meanwhile it develops against a local `npm pack` of feedgrab, never committed.
- E2: When a feedgrab release is pending, Ghostify's code commits for the slice may land before the `package.json`/`bun.lock` commit that pins the release tarball (they are developed against a local pack). The pin is committed as soon as the release exists, before the version bump and the tag, so every tag still builds.
- E3: History in both repos is re-signed with the user's key (`scripts/resign-history.sh`). Only the newest pending feedgrab tag (v0.7.0) runs a release; v0.6.0 is moved in a batch with the old tags and gets no release, so Ghostify v1.10.0 pins feedgrab 0.7.0 and Phase 9 needs no separate install task.
