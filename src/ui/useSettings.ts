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
