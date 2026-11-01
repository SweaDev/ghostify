import { runFeedContent } from '@/src/feed/content';

export default defineContentScript({
  matches: ['*://dev.to/*'],
  runAt: 'document_idle',
  main: (ctx) => runFeedContent(ctx),
});
