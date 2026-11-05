import {
  captureSample,
  createProfile,
  detectFeeds,
  openFeed,
  type SiteProfile,
  suggestPermalinks,
} from 'feedgrab';
import { openOverlay, pickElement } from 'feedgrab/overlay';
import { SAMPLE_OPTIONS } from '../feed/samples';
import { sendMessage } from '../messaging';
import { chooseLinks, type LinkFeed } from './link-chooser';
import { NO_SELECTOR, withPermalink } from './links';
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
  const links = await chooseLinks(document, url, linkFeeds(profile, url, entry?.profile));
  if (!links) return;
  const linked = {
    ...profile,
    feeds: profile.feeds.map((f) => withPermalink(f, links[f.id] ?? NO_SELECTOR)),
  };
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
  const saved = mergePicked(await getSites(), host, title, { profile: linked, ...choice });
  await saveSite(saved);
  await Promise.all(
    linked.feeds.map((f) => {
      const html = captureSample(document, f, SAMPLE_OPTIONS);
      return html && sendMessage('saveSample', { siteId: saved.id, feedId: f.id, url, html });
    }),
  ).catch(console.warn);
  location.reload();
}

/** Each feed's suggested post links (best first) and the selector to start from. */
function linkFeeds(profile: SiteProfile, url: string, before?: SiteProfile): LinkFeed[] {
  const feed = openFeed(document, profile, { builtinExclusions: false, live: false });
  const items = feed.items();
  feed.dispose();
  return profile.feeds.map((f) => {
    const els = items.filter((i) => i.feedId === f.id).map((i) => i.element);
    const options = suggestPermalinks(els.slice(0, 20), url);
    const kept = f.permalink ?? before?.feeds.find((b) => b.id === f.id)?.permalink;
    return { descriptor: f, options, selector: kept ?? options[0]?.selector ?? NO_SELECTOR };
  });
}
