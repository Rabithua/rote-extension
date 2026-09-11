import { useCallback, useEffect, useState } from 'react';
import { storedSettingsSchema, type Settings } from '../settings/store';
import type { TaskView } from '../domain/task';
import { send } from '../messaging/protocol';
import { languageFor, translate } from '../locales/messages';

export function useExtension() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const reloadTasks = useCallback(async () => { setTasks((await send({ type: 'tasks:list' })).tasks ?? []); }, []);
  const load = useCallback(async () => {
    try {
      const data = await send({ type: 'settings:get' });
      setSettings(data.settings ? storedSettingsSchema.parse(data.settings) : null);
      if (data.settings) await reloadTasks();
    } catch (error) { setError(error instanceof Error ? error.message : 'save_failed'); }
    finally { setLoaded(true); }
  }, [reloadTasks]);
  useEffect(() => {
    void load();
    const listener = (message: {type?: string}) => {
      if (message.type === 'connection:changed') void load();
      if (message.type === 'task:changed' || message.type === 'tasks:removed') void reloadTasks().catch(() => setError('save_failed'));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [load, reloadTasks]);
  const language = languageFor(settings?.language);
  const theme = settings?.theme ?? 'system';
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && query.matches));
    update(); query.addEventListener('change',update);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    return () => query.removeEventListener('change',update);
  }, [theme, language]);
  return { language, settings, setSettings, tasks, reloadTasks, loaded, error, t: (key: string) => translate(language,key) };
}
