import { runPicker } from '@/src/sites/run-picker';

// Injected on demand from the popup ("Add this site" / "Edit selectors"). `main` must return
// right away: `scripting.executeScript` awaits its result, and the picker waits on the user.
export default defineContentScript({
  registration: 'runtime',
  main: () => {
    void runPicker().catch(console.warn);
  },
});
