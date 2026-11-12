import {
  captureSample,
  createProfile,
  detectFeeds,
  type FeedDescriptor,
  type ItemStructure,
  openFeed,
  type SiteProfile,
} from 'feedgrab';
import { openOverlay, pickElement } from 'feedgrab/overlay';
import { setPicking } from '../feed/reveal';
import { SAMPLE_OPTIONS } from '../feed/samples';
import { sendMessage } from '../messaging';
import { chooseLinks, type LinkFeed } from './link-chooser';
import { NO_SELECTOR, postLinkOf, withPostLink } from './links';
import { detectView } from './model';
import { existingEntry, findSite, mergePicked } from './picker';
import { getSites, saveSite } from './registry';
import { selectorFor } from './selector';
import { defaultReference, startingParts, withStructure } from './structure';
import { chooseStructure } from './structure-chooser';
import { chooseView, notice } from './view-chooser';

const THEME = { colors: { accent: '#7c5cff', feed: '#7c5cff', item: '#3b82f6' } };

/**
 * Detect → confirm/edit in feedgrab's overlay → sample post and post link → post structure →
 * choose view → save → reload.
 */
export async function runPicker(): Promise<void> {
  if (document.querySelector('[data-feedgrab-overlay], [data-ghostify-chooser]')) return;
  // Ghostified items show (veiled) while picking, so a feed of only ghostified items is found.
  setPicking(document, true);
  try {
    await pick();
  } finally {
    setPicking(document, false);
  }
}

async function pick(): Promise<void> {
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
  const feeds = linkFeeds(profile, entry?.profile);
  const links = await chooseLinks(document, url, feeds);
  if (!links) return;
  const refOf = (f: LinkFeed) => links[f.descriptor.id]?.reference ?? f.reference;
  const shapes = await chooseStructure(
    document,
    feeds.map((f) => ({
      descriptor: f.descriptor,
      items: f.items,
      reference: refOf(f),
      parts: startingParts(f.items, refOf(f), f.structure),
    })),
  );
  if (!shapes) return;
  const linked = {
    ...profile,
    feeds: profile.feeds.map((f) =>
      withStructure(withPostLink(f, links[f.id]?.link ?? { selector: NO_SELECTOR }), shapes[f.id]),
    ),
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
      const lf = feeds.find((x) => x.descriptor.id === f.id);
      const reference = lf?.items[refOf(lf)];
      const html = captureSample(document, f, {
        ...SAMPLE_OPTIONS,
        ...(reference && { reference }),
      });
      return html && sendMessage('saveSample', { siteId: saved.id, feedId: f.id, url, html });
    }),
  ).catch(console.warn);
  location.reload();
}

/**
 * Each feed's posts, the sample post to start from (the first one like the saved structure,
 * else the first) and its saved post link and structure, if any.
 */
function linkFeeds(
  profile: SiteProfile,
  before?: SiteProfile,
): (LinkFeed & { structure?: ItemStructure })[] {
  const feed = openFeed(document, profile, { builtinExclusions: false, live: false });
  const items = feed.items();
  feed.dispose();
  return profile.feeds.map((f) => {
    const els = items.filter((i) => i.feedId === f.id).map((i) => i.element);
    const old = before?.feeds.find((b) => b.id === f.id);
    const has = (d?: FeedDescriptor) => !!(d?.permalink || d?.permalinkParams);
    const prev = has(f) ? f : old;
    const structure = f.structure ?? old?.structure;
    return {
      descriptor: f,
      items: els,
      reference: defaultReference(els, structure),
      ...(prev && has(prev) && { link: postLinkOf(prev) }),
      ...(structure && { structure }),
    };
  });
}
