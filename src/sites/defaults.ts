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

const DEVTO_LOGGED_IN_FEEDS: FeedDescriptor[] = [
  {
    id: 'devto-stories-logged-in',
    // Same nested `div.paged-stories` infinite scroll as the logged-out feed.
    container: {
      type: 'css',
      value: '#rendered-article-feed, #rendered-article-feed .paged-stories',
    },
    item: { type: 'css', value: ':scope > article' },
    exclude: [],
    include: [],
    source: 'manual',
    confidence: 1,
    confirmed: true,
  },
];

const devtoProfile = (pathPattern: string, feeds: FeedDescriptor[]): SiteProfile => ({
  version: CURRENT_PROFILE_VERSION,
  hostname: 'dev.to',
  pathPattern,
  feeds,
});

const DEVTO_PATHS = ['/', '/latest', '/top/*'];

/** Login indicator shipped before the logged-in feed; stored copies are migrated. */
export const LEGACY_DEVTO_INDICATOR = 'body[data-user-status="logged-in"]';

/** dev.to home feeds (Relevant, Latest, Top) for logged-out and logged-in visitors. */
export const DEVTO_SITE: Site = {
  id: 'devto',
  hostname: 'dev.to',
  label: 'DEV Community',
  enabled: true,
  builtin: true,
  loginIndicator: { selector: '#nav-profile-image', whenPresent: 'loggedIn' },
  profiles: [
    ...DEVTO_PATHS.map((p) => ({
      view: 'loggedOut' as const,
      profile: devtoProfile(p, DEVTO_FEEDS),
    })),
    ...DEVTO_PATHS.map((p) => ({
      view: 'loggedIn' as const,
      profile: devtoProfile(p, DEVTO_LOGGED_IN_FEEDS),
    })),
  ],
  rules: [],
};

export const DEFAULT_SITES: Site[] = [DEVTO_SITE];
