import { CURRENT_PROFILE_VERSION, type FeedDescriptor, type SiteProfile } from 'feedgrab';
import type { Site } from './model';

const DEVTO_FEEDS: FeedDescriptor[] = [
  {
    id: 'devto-stories',
    container: { type: 'css', value: '#substories' },
    // Infinite scroll appends each page as a `div.paged-stories` inside the previous one,
    // so pages nest arbitrarily deep (first page: `div.crayons-story`, later: `article`).
    item: { type: 'css', value: ':scope .crayons-story' },
    exclude: [],
    include: [],
    source: 'manual',
    confidence: 1,
    confirmed: true,
  },
  {
    id: 'devto-featured',
    container: { type: 'css', value: '#main-content' },
    item: { type: 'css', value: ':scope > .crayons-story--featured' },
    exclude: [],
    include: [],
    source: 'manual',
    confidence: 1,
    confirmed: true,
  },
];

const devtoProfile = (pathPattern: string): SiteProfile => ({
  version: CURRENT_PROFILE_VERSION,
  hostname: 'dev.to',
  pathPattern,
  feeds: DEVTO_FEEDS,
});

/** dev.to home feeds (Relevant, Latest, Top) for logged-out visitors. */
export const DEVTO_SITE: Site = {
  id: 'devto',
  hostname: 'dev.to',
  label: 'DEV Community',
  enabled: true,
  builtin: true,
  loginIndicator: { selector: 'body[data-user-status="logged-in"]', whenPresent: 'loggedIn' },
  profiles: ['/', '/latest', '/top/*'].map((p) => ({
    view: 'loggedOut',
    profile: devtoProfile(p),
  })),
  rules: [],
};

export const DEFAULT_SITES: Site[] = [DEVTO_SITE];
