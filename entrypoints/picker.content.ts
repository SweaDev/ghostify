import { runGrab } from '@/src/grab/agent';

// Injected on demand from the popup ("Add this site" / "Edit selectors"). `main` must return
// right away: `scripting.executeScript` awaits its result, and the panel waits on the user.
export default defineContentScript({
  registration: 'runtime',
  main: () => {
    void runGrab().catch(console.warn);
  },
});
