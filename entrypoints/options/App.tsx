import {
  Activity,
  Cpu,
  Globe,
  type LucideIcon,
  MessageSquareText,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AiActivity } from '@/src/ui/AiActivity';
import { AiSettings } from '@/src/ui/AiSettings';
import { GeneralSettings } from '@/src/ui/GeneralSettings';
import { GhostIcon } from '@/src/ui/GhostIcon';
import { PromptSettings } from '@/src/ui/PromptSettings';
import { SitesSettings } from '@/src/ui/SitesSettings';
import { useActiveCount } from '@/src/ui/useAi';

type Section = 'sites' | 'ai' | 'prompts' | 'activity' | 'general';

const SECTIONS: {
  key: Section;
  label: string;
  hint: string;
  icon: LucideIcon;
  Body(): React.ReactNode;
}[] = [
  {
    key: 'sites',
    label: 'Sites',
    hint: 'Where Ghostify works and how it finds feeds',
    icon: Globe,
    Body: SitesSettings,
  },
  {
    key: 'ai',
    label: 'AI models',
    hint: 'Providers, models, keys and the search index',
    icon: Cpu,
    Body: AiSettings,
  },
  {
    key: 'prompts',
    label: 'Prompts',
    hint: 'What Ghostify asks the AI',
    icon: MessageSquareText,
    Body: PromptSettings,
  },
  {
    key: 'activity',
    label: 'AI activity',
    hint: 'Every AI request: watch, pause, stop and resume',
    icon: Activity,
    Body: () => <AiActivity />,
  },
  {
    key: 'general',
    label: 'General',
    hint: 'Appearance',
    icon: SlidersHorizontal,
    Body: GeneralSettings,
  },
];

const fromHash = (): Section => {
  const h = location.hash.slice(1);
  return SECTIONS.some((s) => s.key === h) ? (h as Section) : 'sites';
};

export function App() {
  const [section, setSection] = useState<Section>(fromHash);
  const active = useActiveCount() ?? 0;
  useEffect(() => {
    const on = () => setSection(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (s: Section) => {
    history.replaceState(null, '', `#${s}`);
    setSection(s);
  };
  const current = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];
  if (!current) return null;
  const { Body } = current;

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:flex-row">
        <aside className="md:sticky md:top-8 md:h-fit md:w-56 md:shrink-0">
          <div className="mb-4 flex items-center gap-2 px-2">
            <GhostIcon className="size-8 text-ghost-500" />
            <h1 className="font-semibold text-xl">Settings</h1>
          </div>
          <nav
            aria-label="Settings sections"
            className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible"
          >
            {SECTIONS.map((s) => {
              const on = s.key === section;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => go(s.key)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left font-medium text-sm transition ${
                    on
                      ? 'bg-white text-ghost-700 shadow-sm dark:bg-zinc-900 dark:text-ghost-200'
                      : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon className="size-4" />
                  {s.label}
                  {s.key === 'activity' && active > 0 && (
                    <span className="ml-auto rounded-full bg-ghost-500 px-1.5 text-white text-xs tabular-nums">
                      {active}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="mb-4">
            <h2 className="font-semibold text-lg">{current.label}</h2>
            <p className="text-sm text-zinc-500">{current.hint}</p>
          </header>
          <Body />
        </main>
      </div>
    </div>
  );
}
