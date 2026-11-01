import { runFeedContent } from '@/src/feed/content';

// Registered at runtime (src/sites/registration.ts) for user-added sites only.
export default defineContentScript({
  registration: 'runtime',
  main: (ctx) => runFeedContent(ctx),
});
