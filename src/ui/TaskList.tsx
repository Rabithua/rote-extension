import { useState } from 'react';
import { Check, Image, LoaderCircle, AlertCircle } from 'lucide-react';
import type { TaskView } from '../domain/task';
import { send } from '../messaging/protocol';
import { Button } from './button';

export function TaskList({ tasks, t, reload, compact = false }: { tasks: TaskView[]; t: (key: string) => string; reload: () => Promise<void>; compact?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  async function act(task: TaskView, reconcile = false) {
    setError(''); setBusy(task.id);
    try {
      if (task.permissionOrigin && !reconcile) {
        if (!await chrome.permissions.request({ origins: [`${task.permissionOrigin}/*`] })) throw new Error('permissionsDenied');
      }
      await send({ type: reconcile ? 'tasks:reconcile' : 'tasks:retry', id: task.id });
      await reload();
    } catch (error) { setError(error instanceof Error ? error.message : 'save_failed'); }
    finally { setBusy(null); }
  }
  return <section className="section" aria-labelledby="activity-heading">
    <h2 id="activity-heading">{t('activity')}</h2>
    {!tasks.length ? <div className="empty"><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p><p className="hint">{t('captureDefaultsHint')}</p></div> : null}
    {(compact ? tasks.slice(0,3) : tasks).map(task => {
      const active = ['queued','creating','uploading','finalizing'].includes(task.status);
      const Icon = task.status === 'saved' ? Check : active ? LoaderCircle : AlertCircle;
      const status = task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'uncertain' : task.status === 'failed' ? task.noteId ? 'partial' : 'failed' : 'saving';
      return <article className="task" key={task.id}>
        <div className="task-head"><h3 className="task-title">{task.author}</h3><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleTimeString([], { hour:'2-digit',minute:'2-digit' })}</time></div>
        {task.excerpt ? <p>{task.excerpt}</p> : null}
        <div className="status"><Icon size={14} /><span>{t(status)}</span></div>
        {task.imageCount ? <p className="status"><Image size={14} aria-hidden="true" />{task.uploadedCount}/{task.imageCount} {t('images')} · {t('uploaded')}</p> : null}
        {task.error && !compact ? <p className="hint">{t(task.error)}</p> : null}
        {task.permissionOrigin ? <p className="hint">{t('permissionHint')}<br />{task.permissionOrigin}</p> : null}
        <div className="task-actions">
          <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="text-xs">{t(task.site === 'web' ? 'openPage' : task.site === 'arxiv' ? 'openPaper' : task.site === 'hackernews' ? 'openDiscussion' : task.site === 'youtube' || task.site === 'bilibili' ? 'openVideo' : task.site === 'github' ? 'openProject' : 'openSource')}</a>
          {task.status === 'failed' ? <Button variant="outline" size="sm" disabled={busy === task.id} onClick={() => void act(task)}>{t(task.permissionOrigin ? 'grant' : 'retry')}</Button> : null}
          {task.status === 'uncertain' ? <Button variant="outline" size="sm" disabled={busy === task.id} onClick={() => void act(task,true)}>{t('reconcile')}</Button> : null}
        </div>
      </article>;
    })}
    {error ? <p className="feedback error" role="alert">{t(error)}</p> : null}
  </section>;
}
