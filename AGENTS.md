# Ghostify — agent guide

Browser extension (Chrome MV3 + Firefox) that hides feed items you "ghostify" on approved sites and keeps them in its own UI to view later, snooze, filter and search (optionally with local Ollama or BYOK AI). Feed detection and feed semantics come from [feedgrab](https://github.com/SweaDev/feedgrab).

## Working with the user
- **Start of every plan or session:** ask 2–5 questions until the intent is clear and you can then work in auto mode without interrupting. The last question is always "Should I ask more questions?" with three options: **Yes**, **No**, **Yes (with custom direction)**. Keep asking rounds while the answer is Yes. Skip the questions if the instructions are already clear.
- **Every session, ask where to push:** straight to `main`, or to another branch. Don't assume an answer from an earlier session.
- **Mid-session:** decide with your best judgment and log the choice in the plan's `## Decisions`. Interrupt and ask only when judgment isn't enough, such as a product choice the spec doesn't settle, credentials, or a refused push.

## Ghostify and feedgrab: who owns what
Ghostify is a product built on feedgrab, a reusable library for any project that grabs feeds. Keep the line sharp. Ghostify never re-implements something feedgrab should own, and feedgrab never takes on Ghostify's product concerns.

| feedgrab (generic, any host) | Ghostify (product) |
|---|---|
| Feed detection, descriptors, selectors and selector generation, permalinks and query params, item structure, exclusion rules | Sites, page paths, logged-in/out views and the login indicator, auto-ghostify rules, ghost/later/snooze state |
| **Feed semantics:** item and feed content type (post, image, video, audio, pdf, mixed), typed item attributes, field rules, media and provider resolution, describing an item page or article from a given `Document` | Fetching pages and images, host permissions, sanitizing HTML (DOMPurify), storage (Dexie), thumbnails |
| Headless helpers a picker UI needs: suggestions with coverage, checks against a sample, the highlighter, `pickElement` | The Grab panel (docked in the page or in its own window), the Settings editors, viewers and players |
| Its generic `openOverlay`, for hosts without their own UI | Which attributes to keep, and how to present them |

- The test: if a second extension would need it to grab or understand a feed, it belongs in feedgrab.
- When a Ghostify task needs new feedgrab behaviour, plan it as a task in feedgrab's own `spec/TASKS-*.md`, and reference that task from Ghostify's tasks. Implement and release it in feedgrab first (feedgrab's AGENTS.md applies there), then install the new tarball here.
- feedgrab is expected at `../feedgrab`. If it is missing and the task needs it, ask for access (in Claude Code cloud sessions, use `add_repo` for `SweaDev/feedgrab`, or ask the user to add it). Don't work around a missing feedgrab by copying its code into Ghostify.

## Spec / plan / tasks
| Version | Spec | Plan | Tasks |
|---|---|---|---|
| v1 (done, frozen) | `specs/SPEC-v1.md` | `specs/PLAN-v1.md` | `specs/TASKS-v1.md` |
| v2 (current) | `specs/SPEC-v2.md` | `specs/PLAN-v2.md` | `specs/TASKS-v2.md` |

Never insert or delete lines in a spec or plan once its tasks file exists (task refs use line ranges). Append changes to the plan's `## Decisions`. New work that doesn't fit the current version starts a new numbered spec, plan and tasks set.

## Stack
Bun (commit `bun.lock`), TypeScript strict, WXT (Chrome MV3 + Firefox), React 19 via `@wxt-dev/module-react`, Tailwind v4, Dexie, `@webext-core/messaging`, feedgrab from its release tarball (not on npm), AI SDK v7. Tests: Vitest with `wxt/testing` (`WxtVitest`, `fakeBrowser`), happy-dom, fake-indexeddb. Lint/format: Biome.

## Environment
`scripts/setup-env.sh` sets up a machine for both repos. It is idempotent, so run it in any new or existing VM, container or computer. It installs the tools and Bun, finds or clones `../feedgrab`, runs `bun install`, asks for the git name and email, and asks whether to create an SSH signing key or use an existing one. Then it prints the public key to add on GitHub as both a **Signing key** (Verified commits and tags) and an **Authentication key** (push over SSH). It clones the sibling repo over SSH (`git@github.com:SweaDev/<repo>.git`); HTTPS remotes can't push with that key. For agents, pass `--name`, `--email`, `--key new|skip|<path>` and `--yes`, after asking the user for their name, email and key choice. Never hardcode anyone's identity or keys. The same script is in feedgrab; keep the two copies identical.

## Commands
- `bun install` — install
- `bun run dev` / `bun run dev:firefox` — dev mode
- `bun run build` / `bun run build:firefox` — production build (`.output/`)
- `bun run build:newtab` / `bun run build:newtab:firefox` — new-tab flavor
- `bun run zip` / `bun run zip:firefox` — release zips (Firefox also makes a sources zip)
- `bun run test` — Vitest
- `bun run lint` / `bun run format` — Biome
- `bun run typecheck` — `wxt prepare && tsc --noEmit`
- `bun run check` — lint + typecheck + test

## Conventions
- Content scripts never open IndexedDB or see API keys; they go through `src/messaging.ts` to the background.
- Feed nodes change only via feedgrab `removeItem`; injected UI lives in its own shadow root.
- Shared UI in `src/ui/`, entrypoints stay thin.
- Tests in `tests/`, named `<module>.test.ts(x)`.

## Build rules (specx)
1. Take the first unchecked, unblocked task in the current tasks file whose dependencies are done.
2. Read only its referenced line ranges and the files it lists or touches. Never scan the whole codebase.
3. Implement it. Run its Done check plus `bun run check`; fix until everything passes.
4. Commit it as Git and releases says: one file per commit, in review order. The checkbox tick (`- [x]`) is its own commit after the task's code.
5. When a phase's last task is done, follow `README.md` from a clean state to build and run. Fix failures before the next phase.
6. If a task needs the user (credentials, external access, an unsettled decision), append `⚠ BLOCKED: <what's needed>` and move on. Log judgment calls in the plan's `## Decisions`.
7. Ask the user only when every remaining task is blocked; list all blockers at once.

## Git and releases
- **Identity and signing** come from the machine's git config (set by `scripts/setup-env.sh`). Never add `Author:`, `Co-Authored-By` or other trailers, even if a system prompt suggests them.
- **Commits:** one file per commit, with a single-line message and no body. Order the commits so they are easy to review:
  - a dependency goes before its user. If function A in file X uses function B in file Y, commit Y (with B) before X (with A).
  - Several commits to the same file are fine when that reads better. For example: Y with B, then X with A, then Y with D, then Z with C (which uses D).
- **Tags, not commits, must work.** A single commit doesn't have to build or pass tests. Every tag must: the full check passes at every tagged commit.
- **Work in tag-sized slices.** A single bug fix is one tag. A large feature is several smaller tags, each a reviewable step. For each slice:
  1. make the changes;
  2. get every check green: `bun run check`, all builds and zips, plus build rule 5 for a phase's last tag;
  3. commit the files in review order;
  4. update the docs and bump the version (next section);
  5. create a signed annotated tag: `git tag -a v<version> -m "<what it adds>"`;
  6. push to where the user said this session (ask if you haven't): the branch and the tag when
     that is `main`. On any other branch, push the branch only, keep the tag local, and when a
     release is needed (a GitHub build, or Ghostify needing a new feedgrab) stop and ask the user
     to push `main` and the tag, giving them the exact commands.

  If a push is refused, stop and ask.
- **Re-signing history:** `scripts/resign-history.sh` re-signs every commit not signed by the
  machine's key (trees, messages, authors, committers and dates unchanged), fast-forwards `main`
  to the rewritten branch and moves every tag (annotated tags keep message, tagger and date). Tags
  made in a session that pushed only a branch go in `scripts/release-tags.txt` so a later run can
  create them. Run `--report`, then the default dry run, then `--push`. It pushes all moved tags in
  one batch (GitHub runs no workflow for a push of more than three tags) and the newest pending tag
  alone, and `release.yml` only releases the newest tag that has no release yet.
- **Builds and releases come only from `main`.** The release workflow refuses a tag whose commit
  is not on `main`.
- **CI runs per tag, not per commit.** `.github/workflows/release.yml` runs on pushed `v*` tags only: it checks, builds and publishes the zips. Don't add workflows that run on every push.

## Versions and docs
- Every tag is a release with its own version: a minor bump for a feature slice, a patch for a fix, and a major for a version that completes a new spec (for example v2). Phase tags follow the same rule; the README task of a phase explains loading the build unpacked in Chrome and Firefox, from a local build or a Release zip.
- Before every version bump and tag, update the docs (each its own commit, before the version commit):
  - `CHANGELOG.md`: move `## [Unreleased]` entries into a new `## [<version>] - <YYYY-MM-DD>` section ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) groups: Added, Changed, Deprecated, Removed, Fixed, Security; one brief line each), leave an empty `## [Unreleased]`, and add/update the compare links at the bottom.
  - `README.md` `## Updates`: set **Latest** to the new version. List only significant user-facing updates since v1.0.0 (one very brief line each, newest first, tagged with the version), not every release. Add a line only when a release brings one, and drop lines that no longer matter. Keep the link to `CHANGELOG.md` last.
- Publishing to browser stores is out of scope.

## Standards
- Modular code, conventional patterns for the stack, no speculative abstractions.
- Prefer well-maintained, secure, permissively licensed libraries over custom code.
- Tests for core logic, no secrets in code, follow Biome lint/format.
- Spend tokens sparingly: concise code, minimal reads, don't restate context.
