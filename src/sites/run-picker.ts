import { createProfile, detectFeeds, openFeed, type SiteProfile } from 'feedgrab';
import { openOverlay, pickElement } from 'feedgrab/overlay';
import { chooseLinks, type LinkFeed } from './link-chooser';
import { deepestIndex, type ItemLinks, linkOptions, NO_SELECTOR } from './links';
import { detectView } from './model';
import { existingEntry, findSite, mergePicked } from './picker';
import { getSites, saveSite } from './registry';
import { selectorFor } from './selector';
import { chooseView, notice } from './view-chooser';

const THEME = { colors: { accent: '#7c5cff', feed: '#7c5cff', item: '#3b82f6' } };

/** Detect → confirm/edit in feedgrab's overlay → choose view → save → reload. */
export async function runPicker(): Promise<void> {
  if (document.querySelector('[data-feedgrab-overlay], [data-ghostify-chooser]')) return;
  const url = location.href;
  const host = location.hostname;
  const site = findSite(await getSites(), host);
  const current = site ? (detectView(site, document) ?? 'any') : 'any';
  const entry = existingEntry(site, url, current) ?? existingEntry(site, url, 'any');
  const existing = entry?.profile;

  // feedgrab pre-accepts the `existing` profile's feeds; for a new page, pre-accept the best proposal.
  const proposals = await detectFeeds(document);
  const [best, ...rest] = proposals;
  const seed = existing ?? (best && createProfile({ url, feeds: [best] }));
  let profile: Awaited<ReturnType<typeof openOverlay>>;
  try {
    profile = await openOverlay(document, existing || !best ? proposals : rest, {
      existing: seed,
      theme: THEME,
    });
  } catch {
    return; // cancelled
  }
  if (!profile.feeds.length) {
    notice(document, 'No feed was ticked, so nothing was saved. Open the picker again to retry.');
    return;
  }
  const links = await chooseLinks(document, url, linkFeeds(profile, url, entry?.links));
  if (!links) return;
  const choice = await chooseView(document, {
    indicator: site?.loginIndicator,
    pickIndicator: async () => selectorFor(await pickElement(document)),
  });
  if (!choice) return;
  const title =
    document.title
      .split(/\s[|–—-]\s/)
      .at(-1)
      ?.trim() ?? host;
  await saveSite(mergePicked(await getSites(), host, title, { profile, ...choice, links }));
  location.reload();
}

/** Each feed's items on this page, its link options and the selector to start from. */
function linkFeeds(profile: SiteProfile, url: string, saved: ItemLinks = {}): LinkFeed[] {
  const feed = openFeed(document, profile, { builtinExclusions: false, live: false });
  const items = feed.items();
  feed.dispose();
  return profile.feeds.map((f) => {
    const els = items.filter((i) => i.feedId === f.id).map((i) => i.element);
    const options = linkOptions(els, url);
    const kept = saved[f.id]?.selector;
    return {
      feedId: f.id,
      item: els[0],
      options,
      selector: kept ?? options[deepestIndex(options.map((o) => o.url))]?.selector ?? NO_SELECTOR,
    };
  });
}
