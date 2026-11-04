import { GhostIcon } from './GhostIcon';
import { card } from './kit';

const AUTHOR = 'Fayaz Ahmed';
const REPO = 'https://github.com/SweaDev/ghostify';

export function GeneralSettings() {
  const { version } = browser.runtime.getManifest();
  return (
    <section className={`${card} flex flex-col gap-4`}>
      <div className="flex items-center gap-3">
        <GhostIcon className="size-12 drop-shadow-sm" />
        <div>
          <h3 className="font-semibold text-lg">About Ghostify</h3>
          <p className="text-sm text-zinc-500">Version {version}</p>
        </div>
      </div>
      <p className="text-sm text-zinc-600 leading-relaxed dark:text-zinc-300">
        Ghostify hides feed posts you've seen or don't want right now, and keeps them so you can
        read them later, snooze them, and filter or search them, with optional AI that runs in your
        browser or with your own provider.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-zinc-100 border-t pt-4 text-sm dark:border-zinc-800">
        <dt className="text-zinc-500">Author</dt>
        <dd className="font-medium">{AUTHOR}</dd>
        <dt className="text-zinc-500">Repository</dt>
        <dd>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="break-all font-medium text-ghost-600 hover:underline dark:text-ghost-300"
          >
            {REPO.replace('https://', '')}
          </a>
        </dd>
      </dl>
    </section>
  );
}
