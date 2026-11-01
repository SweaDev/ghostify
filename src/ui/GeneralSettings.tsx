import { useEffect, useState } from 'react';
import { getSettings, type Settings, saveSettings, watchSettings } from '../store/settings';

export function useSettings(): [Settings | undefined, (s: Settings) => void] {
  const [settings, setSettings] = useState<Settings>();
  // Follows storage, so a page never saves a stale copy over changes made elsewhere.
  useEffect(() => {
    void getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  const update = (s: Settings) => {
    setSettings(s);
    void saveSettings(s);
  };
  return [settings, update];
}

export function GeneralSettings() {
  const [settings, update] = useSettings();
  if (!settings) return null;
  return (
    <section className="flex flex-col gap-4">
      <label className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <span>
          <span className="block font-medium">Theme</span>
          <span className="text-sm text-zinc-500">Applies to the popup and Ghostify pages.</span>
        </span>
        <select
          value={settings.ui.theme}
          onChange={(e) =>
            update({ ...settings, ui: { theme: e.target.value as Settings['ui']['theme'] } })
          }
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </section>
  );
}
