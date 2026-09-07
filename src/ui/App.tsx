import { ConnectionForm } from './ConnectionForm';
import { TaskList } from './TaskList';
import { useExtension } from './useExtension';

export function App() {
  const { settings, setSettings, tasks, reloadTasks, loaded, error, t } = useExtension();
  return <main className="page">
    <header className="brand"><img src="/rote.svg" alt="" /><div><h1>{t('app')}</h1><p className="subtitle">{t('tagline')}</p></div></header>
    {error ? <p className="error" role="alert">{t(error)}</p> : null}
    <div className="options-layout">
      <div className="settings-column">
        {loaded ? <ConnectionForm key={settings?.id ?? 'new'} settings={settings} onSaved={value => { setSettings(value); void reloadTasks(); }} t={t} /> : null}
      </div>
      <div className="activity-column"><TaskList tasks={tasks} reload={reloadTasks} t={t} /></div>
    </div>
  </main>;
}
