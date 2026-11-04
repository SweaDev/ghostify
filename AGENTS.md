# Ghostify — agent guide

Browser extension (Chrome MV3 + Firefox) that hides feed items you "ghostify" on approved sites and keeps them in its own UI to view later, snooze, filter and search (optionally with local Ollama or BYOK AI). Feed detection uses [feedgrab](https://github.com/SweaDev/feedgrab).

## Spec / plan / tasks
| Spec | Plan | Tasks |
|---|---|---|
| `specs/SPEC-v1.md` | `specs/PLAN-v1.md` | `specs/TASKS-v1.md` |

Never insert or delete lines in a spec or plan once its tasks file exists (task refs use line ranges). Append changes to the plan's `## Decisions`.

## Stack
Bun (commit `bun.lock`), TypeScript strict, WXT (Chrome MV3 + Firefox), React 19 via `@wxt-dev/module-react`, Tailwind v4, Dexie, `@webext-core/messaging`, feedgrab from its release tarball (not on npm), AI SDK v7. Tests: Vitest with `wxt/testing` (`WxtVitest`, `fakeBrowser`), happy-dom, fake-indexeddb. Lint/format: Biome.

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
1. Take the first unchecked, unblocked task in `specs/TASKS-v1.md` whose dependencies are done.
2. Read only its referenced line ranges and the files it lists or touches. Never scan the whole codebase.
3. Implement it. Run its Done check plus `bun run check`; fix until everything passes.
4. Mark the task `- [x]` and commit code + checkbox together with `git commit -m "<one-line message>"` — no body, no trailers. Never push.
5. When a phase's last task is done, follow `README.md` from a clean state to build and run. Fix failures before the next phase.
6. If a task needs the user (credentials, external access, an unsettled decision), append `⚠ BLOCKED: <what's needed>` and move on. Log judgment calls in the plan's `## Decisions`.
7. Ask the user only when every remaining task is blocked; list all blockers at once.

## Phases and releases
- Each phase's README task sets `package.json` version to `0.N.0` for phase N (`1.0.0` for the last phase) and explains loading the build unpacked in Chrome and Firefox, from a local build or a Release zip.
- After the phase check passes: `git tag -a v<version> -m "Phase N: <what runs>"`. Never push tags or branches; tell the user `git push origin v<version>` publishes the release.
- Before every version bump and tag (phase or not), update the docs in the same commit:
  - `CHANGELOG.md`: move `## [Unreleased]` entries into a new `## [<version>] - <YYYY-MM-DD>` section ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) groups: Added, Changed, Deprecated, Removed, Fixed, Security; one brief line each), leave an empty `## [Unreleased]`, and add/update the compare links at the bottom.
  - `README.md` `## Updates`: set **Latest** to the new version. List only significant user-facing updates since v1.0.0 (one very brief line each, newest first, tagged with the version), not every release; add a line only when a release brings one, and drop lines that no longer matter. Keep the link to `CHANGELOG.md` last.
- `.github/workflows/release.yml` builds and publishes zips on pushed `v*` tags.
- Publishing to browser stores is out of scope.

## Standards
- Modular code, conventional patterns for the stack, no speculative abstractions.
- Prefer well-maintained, secure, permissively licensed libraries over custom code.
- Tests for core logic, no secrets in code, follow Biome lint/format.
- Spend tokens sparingly: concise code, minimal reads, don't restate context.
