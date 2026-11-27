# Ghostify v2: semantic feeds

v1 (`specs/SPEC-v1.md`) ghostifies feed items and keeps their title, excerpt, link, image and author. v2 understands what each item is and presents it accordingly, on top of feedgrab's semantic feeds (feedgrab `spec/SPEC-02.md`).

## Features

- **Content kinds.** Every ghostified item has a kind from feedgrab: post, image, video, audio or PDF. Ghostify stores its typed attributes: for posts and images their content (text and HTML from the feed, images); for video, audio and PDF only what's needed to play or view them (media or embed URL, provider, poster, duration). Media is never downloaded (a later version may offer saving it locally).
- **Thumbnails.** Ghostify keeps the image URLs and one small local thumbnail per item, so cards still show when a site's image link expires.
- **Viewers.** The viewer shows each kind its own way: a reader for posts, a lightbox for images, a player for video and audio (native for direct files, the provider's player where it allows embedding, else **Play on site** in a popup window), and the browser's PDF viewer for PDFs. The Ghostify page shows each card's kind, a duration for media, and can filter by kind.
- **Grab panel.** Adding or editing a site uses one tidy Ghostify panel that follows light and dark mode, with advanced options hidden until asked for:
  1. **Feeds:** the feeds feedgrab found, each with its content type and item count.
  2. **Content:** the feed's content type and the attributes feedgrab found on a sample item, with how many items have each; any attribute can be changed by picking an element on the page (inspect) or typing a selector; a preview shows how items will look in Ghostify.
  3. **Save:** the pages and the view (logged in, logged out or any).

  The panel docks to the right, bottom or left of the page, or pops out into its own window, like the browser's developer tools.
- **Item pages.** When the full content is loaded, feedgrab describes the item's page (article text, or a video's player) and Ghostify shows it.
- **Settings → Sites** edits each feed's content type and attributes, checked against the saved sample.

## Ownership
feedgrab recognizes and reports content types and attributes; Ghostify chooses what to keep, stores it and presents it. Ghostify never re-implements feedgrab's recognition (see `AGENTS.md`).
