const HUB = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//;

/**
 * A fetch that only reaches Hugging Face for models in `allowed` (a download the user started),
 * so inference never downloads anything; cached files never get here.
 */
export function gatedFetch(base: typeof fetch, allowed: ReadonlySet<string>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const repo = HUB.exec(url)?.[1];
    if (repo && !allowed.has(repo))
      throw new Error(`${repo} is not downloaded yet. Download it in Settings → AI.`);
    return base(input, init);
  }) as typeof fetch;
}
