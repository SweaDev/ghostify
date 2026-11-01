import { createProfile, detectFeeds } from 'feedgrab';
import { openOverlay, pickElement } from 'feedgrab/overlay';
import { detectView } from './model';
import { existingProfile, findSite, mergePicked } from './picker';
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
  const existing = existingProfile(site, url, current) ?? existingProfile(site, url, 'any');

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
  await saveSite(mergePicked(await getSites(), host, title, { profile, ...choice }));
  location.reload();
}
