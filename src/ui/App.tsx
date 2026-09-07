import { Settings2 } from 'lucide-react';
import { ConnectionForm } from './ConnectionForm';
import { TaskList } from './TaskList';
import { useExtension } from './useExtension';
import { Button } from './button';

export function App({ compact = false }: { compact?: boolean }) {
  const { settings, setSettings, tasks, reloadTasks, loaded, error, t } = useExtension();
  return <main className={compact ? 'popup' : 'page'}>
    <header className="brand"><img src="/rote.svg" alt="" /><div><h1>{t('app')}</h1><p className="subtitle">{t('tagline')}</p></div></header>
    {error ? <p className="error" role="alert">{t(error)}</p> : null}
    {loaded && !compact ? <ConnectionForm key={settings?.id ?? 'new'} settings={settings} onSaved={value => { setSettings(value); void reloadTasks(); }} t={t} /> : null}
    {compact && !settings ? <p className="hint mt-6">{t('not_configured')}</p> : null}
    {!compact ? <hr className="rule" /> : null}
    <TaskList tasks={tasks} reload={reloadTasks} t={t} compact={compact} />
    {compact ? <footer><span className="status">{t(settings ? 'ready' : 'not_configured')}</span><Button variant="ghost" size="icon" aria-label={t('settingsLink')} onClick={() => void chrome.runtime.openOptionsPage()}><Settings2 /></Button></footer> : null}
  </main>;
}
