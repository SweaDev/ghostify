import { useState } from 'react';
import { GeneralSettings } from '@/src/ui/GeneralSettings';
import { GhostIcon } from '@/src/ui/GhostIcon';
import { SitesSettings } from '@/src/ui/SitesSettings';
import { Tabs } from '@/src/ui/Tabs';

type Section = 'sites' | 'general';

export function App() {
  const [section, setSection] = useState<Section>('sites');
  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-center gap-3">
          <GhostIcon className="size-8 text-ghost-500" />
          <h1 className="font-semibold text-xl">Settings</h1>
          <nav className="ml-auto">
            <Tabs<Section>
              active={section}
              onChange={setSection}
              tabs={[
                { key: 'sites', label: 'Sites' },
                { key: 'general', label: 'General' },
              ]}
            />
          </nav>
        </header>
        {section === 'sites' ? <SitesSettings /> : <GeneralSettings />}
      </div>
    </div>
  );
}
