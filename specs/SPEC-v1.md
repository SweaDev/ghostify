# Ghostify

Ghostify is a browser extension that reads feeds from approved sites (or pages of a site), ghostifies items from the feeds for later viewing, filtering, semantic searching or simply because the site keeps showing the same item (post/video) even though I've seen it. Any ghostified item will simply be removed from the original feed, but present in the plugin to later view, snooze, or present only in the ghostified tab within the plugin until the user removes it.

## Features

- will use [feedgrab](https://github.com/SweaDev/feedgrab) to grab feeds from pages.
- will provide a beautiful usable interface for the purpose.
- settings option to take the newtab for ghostified feed consumption.
- Auto add dev.to non-logged in home feeds for now. With option to add more sites.
- Uses feedgrab to custom select feed selectors.
- option to differentiate logged in and non-logged in view of a site. Keep separate selectors for separate views.
- cool ghostify (casper like) icon appears on feed items that are activated and recognized - clicking it ghostifies the item.
- use local models with ollama when chosen from settings. Use [embeddinggemma2](https://ollama.com/library/embeddinggemma-2) for RAG, [Gemma4 E2B](https://ollama.com/library/gemma4) for general small model use (to auto generate summary, filtering tags etc.), [d3:2b](https://ollama.com/library/d3) for local decision model.
- BOYK with openrouter, gemini, openai option with different models for the same purpose.


