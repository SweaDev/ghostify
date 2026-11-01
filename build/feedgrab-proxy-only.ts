import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * feedgrab lazily imports its AI SDK model runner for `LanguageModel` backends. Ghostify only
 * passes proxy backends to feedgrab core (models run via `feedgrab/llm` in the background), so
 * the runner is replaced with a stub to keep `ai` out of content-script bundles.
 */
export function feedgrabProxyOnly(): Plugin {
  return {
    name: 'ghostify:feedgrab-proxy-only',
    enforce: 'pre',
    load(id) {
      if (!/[\\/]feedgrab[\\/]dist[\\/]chunk-[^\\/]+\.js$/.test(id)) return null;
      const code = readFileSync(id, 'utf8');
      if (!/as runModel\b/.test(code)) return null;
      return `export function runModel() { throw new Error('LLM_MODEL_UNSUPPORTED_IN_BUNDLE'); }`;
    },
  };
}
