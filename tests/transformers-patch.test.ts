import { readFileSync } from 'node:fs';

// patches/@huggingface%2Ftransformers@*.patch: in browsers Transformers.js chains session loads and
// runs on one promise, so one failure made every later model fail with that same error.
describe('Transformers.js patch', () => {
  it('keeps the web load and run chains settled after a failure', () => {
    const web = readFileSync(
      require.resolve('@huggingface/transformers').replace(/transformers\.node\.c?js$/, '') +
        'transformers.web.js',
      'utf8',
    );
    expect(web).toContain('webInitChain = pending.catch(() => {})');
    expect(web).toContain('webInferenceChain = pending.catch(() => {})');
  });
});
