import { runPicker } from '@/src/sites/run-picker';

// Injected on demand from the popup ("Add this site" / "Edit selectors").
export default defineContentScript({
  registration: 'runtime',
  main: () => runPicker(),
});
