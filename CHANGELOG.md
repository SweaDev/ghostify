# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.1] - 2026-11-06
### Added
- Sort the Ghostify page by date ghostified or relevance to the search (by date without one), descending, ascending or random. The choice is remembered.

## [1.5.0] - 2026-11-05
### Added
- Choose which link in a post is its URL when adding a site: pick from the suggested links (the best one is preselected) or edit the selector. Suggestions are ranked across the feed's posts, so x.com suggests the post, not the author or a photo.
- Edit a page's post link (suggestion or selector) in **Settings → Sites**.
- **Settings → Sites** checks edited selectors against a small saved sample of each feed (two posts, at most 20 KB, kept on this device and never exported). It shows how many posts they find and where the first one links, and warns without blocking when the sample can't confirm an edit.
- Samples are saved when you add a site and refreshed from the page when missing or older than 30 days.

### Changed
- Ghostify recognises posts by their post link (feedgrab `permalink`), so changing a page's post link can make posts ghostified there show again.
- Requires feedgrab 0.2.0.

### Fixed
- Posts without a linked heading (such as on x.com) saved the author's profile link instead of the post's.
- On sites without time-stamp or heading links, posts by the same author could share an id, so one was dropped or ghostifying one hid both.

## [1.4.5] - 2026-11-04
### Added
- Edit a site's pages by hand in **Settings → Sites**: path pattern, view, and each feed's container and item selectors (CSS or XPath), checked before saving.
- **Restore built-in settings** for built-in sites (pages, selectors and login indicator; you choose whether to keep pages you added), and a restore button on each edited built-in page. Built-in pages are marked **built-in**.

## [1.4.4] - 2026-11-04
### Changed
- **Settings → Sites** is a searchable list; each site's settings open on their own page with a breadcrumb, and the browser Back button returns to the list.

## [1.4.3] - 2026-11-04
### Changed
- **Open original** in the viewer (Overview and Reader tabs) is a regular link, so middle-click, Ctrl/Cmd-click and "Copy link" work.

## [1.4.2] - 2026-11-04
### Changed
- The viewer's Overview tab has an **Open original** button (opens the post in a new tab) in place of **Read here**.

## [1.4.1] - 2026-11-04
### Added
- Per-site ghost button placement in Settings → Appearance (**Applies to**); other sites keep the all-sites position.

## [1.4.0] - 2026-11-04
### Added
- Move the ghost button to any corner of a post, with its own margins, in Settings → Appearance.
- About Ghostify card in Settings → General.

## [1.3.5] - 2026-11-04
### Fixed
- dev.to logged-in feed works on every home tab (Discover, Following, Curated, Latest, Top and the rest), not just `/`.

## [1.3.4] - 2026-11-04
### Changed
- The 👻 emoji is the Ghostify icon everywhere.

## [1.3.3] - 2026-11-04
### Fixed
- dev.to feed items can be ghostified in the logged-in view.

## [1.3.2] - 2026-11-02
### Fixed
- dev.to stories from deep infinite scroll (and after navigating back) get the ghost button.

## [1.3.1] - 2026-11-01
### Fixed
- Tabs left orphaned by an extension reload offer a page reload instead of failing to ghostify.

## [1.3.0] - 2026-11-01
### Added
- Hover ghost with a haunting aura, and a mist-away animation when a post is ghostified.

## [1.2.1] - 2026-11-01
### Fixed
- dev.to infinite-scroll stories get the ghost button.
- Built-in site selectors refresh when the extension updates.

## [1.2.0] - 2026-11-01
### Added
- In-browser AI models (Transformers.js), downloadable and testable from Settings → AI.
- Undo for unghosting, paged lists (**Show more**), and a confirmation before deleting a site.

### Changed
- In-browser models are the default AI provider; rule checks use a zero-shot classifier.
- Faster item lists, search reads only the current model's vectors, and page watchers are throttled.
- Settings stay in sync across pages; drawers handle focus.

### Security
- The background checks message senders and validates drafts and imported sites.
- Full-content loads are capped (5 MB, 20 s), model listings time out, and the extension sets an explicit CSP.

## [1.1.0] - 2026-11-01
### Added
- AI activity log with pause, resume and stop for each job or all at once.
- Custom prompts in Settings → Prompts.
- Viewer with Reader (**Load full content**) and **Ask AI** tabs.

### Changed
- Redesigned viewer and settings.

## [1.0.5] - 2026-11-01
### Added
- Tev1 (0.8b, 4b) as an Ollama decision model.

### Fixed
- Double clear button in the search box.

## [1.0.4] - 2026-11-01
### Changed
- Decision model answers are cached per item, skipping repeat calls.

## [1.0.3] - 2026-11-01
### Added
- Pick AI models from each provider's model list, grouped by type.
- d1-omni and Jev System One decision models.

## [1.0.2] - 2026-11-01
### Fixed
- The ghost button stays visible over hover preview overlays (e.g. YouTube).

## [1.0.1] - 2026-11-01
### Added
- Search index builds in the background, with live progress.
- Ollama setup guide in the README.

[Unreleased]: https://github.com/SweaDev/ghostify/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/SweaDev/ghostify/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/SweaDev/ghostify/compare/v1.4.5...v1.5.0
[1.4.5]: https://github.com/SweaDev/ghostify/compare/v1.4.4...v1.4.5
[1.4.4]: https://github.com/SweaDev/ghostify/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/SweaDev/ghostify/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/SweaDev/ghostify/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/SweaDev/ghostify/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/SweaDev/ghostify/compare/v1.3.5...v1.4.0
[1.3.5]: https://github.com/SweaDev/ghostify/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/SweaDev/ghostify/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/SweaDev/ghostify/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/SweaDev/ghostify/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/SweaDev/ghostify/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/SweaDev/ghostify/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/SweaDev/ghostify/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/SweaDev/ghostify/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/SweaDev/ghostify/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/SweaDev/ghostify/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/SweaDev/ghostify/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/SweaDev/ghostify/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/SweaDev/ghostify/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/SweaDev/ghostify/compare/v1.0.0...v1.0.1
