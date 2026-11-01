import { detectFeeds } from 'feedgrab';
import { openOverlay } from 'feedgrab/overlay';
import { detectView } from './model';
import { existingProfile, findSite, mergePicked } from './picker';
import { getSites, saveSite } from './registry';
import { chooseView } from './view-chooser';

const THEME = { colors: { accent: '#7c5cff', feed: '#7c5cff', item: '#3b82f6' } };

/** Detect → confirm/edit in feedgrab's overlay → choose view → save → reload. */
export async function runPicker(): Promise<void> {
  if (document.querySelector('[data-feedgrab-overlay], [data-ghostify-chooser]')) return;
  const url = location.href;
  const host = location.hostname;
  const site = findSite(await getSites(), host);
  const current = site ? (detectView(site, document) ?? 'any') : 'any';
  const existing = existingProfile(site, url, current) ?? existingProfile(site, url, 'any');

  let profile: Awaited<ReturnType<typeof openOverlay>>;
  try {
    profile = await openOverlay(document, await detectFeeds(document), { existing, theme: THEME });
  } catch {
    return; // cancelled
  }
  const choice = await chooseView(document, { indicator: site?.loginIndicator });
  if (!choice) return;
  const title =
    document.title
      .split(/\s[|–—-]\s/)
      .at(-1)
      ?.trim() ?? host;
  await saveSite(mergePicked(await getSites(), host, title, { profile, ...choice }));
  location.reload();
}
