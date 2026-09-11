import { languageFor, type Language } from '../locales/messages';
import { MorphText } from './MorphText';
import { StatusIcon } from './StatusIcon';
import { useRef, useState } from 'react';
import { Image } from 'lucide-react';
import type { TaskView } from '../domain/task';
import { send } from '../messaging/protocol';
import { Button } from './button';

export function TaskList({ tasks, t, reload, compact = false, language = languageFor() }: { tasks: TaskView[]; t: (key: string) => string; reload: () => Promise<void>; compact?: boolean; language?: Language }) {
  type Action = 'retry' | 'reconcile' | 'remove';
  const [feedback, setFeedback] = useState<Record<string, { key: string; error: boolean }>>({});
  const [busy, setBusy] = useState<Record<string, Action>>({});
  const pending = useRef(new Set<string>());
  async function act(task: TaskView, action: Action) {
    if (pending.current.has(task.id)) return;
    if (action === 'remove' && !window.confirm(t('removeCaptureConfirm'))) return;
    pending.current.add(task.id);
    setFeedback(current => { const next = { ...current }; delete next[task.id]; return next; });
    setBusy(current => ({ ...current, [task.id]: action }));
    try {
      if (task.permissionOrigin && action === 'retry') {
        if (!await chrome.permissions.request({ origins: [`${task.permissionOrigin}/*`] })) throw new Error('permissionsDenied');
      }
      const result = await send({ type: action === 'remove' ? 'tasks:remove' : action === 'reconcile' ? 'tasks:reconcile' : 'tasks:retry', id: task.id });
      if (action === 'reconcile') setFeedback(current => ({ ...current, [task.id]: { key: result.reconciliation ? `reconcile_${result.reconciliation}` : 'checked', error: false } }));
      await reload();
    } catch (error) {
      setFeedback(current => ({ ...current, [task.id]: { key: error instanceof Error ? error.message : 'save_failed', error: true } }));
    } finally {
      pending.current.delete(task.id);
      setBusy(current => { const next = { ...current }; delete next[task.id]; return next; });
    }
  }
  return <section className="section" aria-labelledby="activity-heading">
    <h2 id="activity-heading">{t('activity')}</h2>
    {!tasks.length ? <div className="empty"><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p><p className="hint">{t('captureDefaultsHint')}</p></div> : null}
    {(compact ? tasks.slice(0,3) : tasks).map(task => {
      const active = ['queued','creating','uploading','finalizing'].includes(task.status);
      const status = task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'uncertain' : task.status === 'failed' ? task.noteId ? 'partial' : 'failed' : 'saving';
      return <article className="task" key={task.id}>
        <div className="task-head"><h3 className="task-title">{task.author}</h3><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en', { hour:'2-digit',minute:'2-digit' })}</time></div>
        {task.excerpt ? <p>{task.excerpt}</p> : null}
        <div className="status"><StatusIcon state={task.status === 'saved' ? 'saved' : active ? 'saving' : 'error'} /><MorphText>{t(status)}</MorphText></div>
        {task.imageCount ? <p className="status"><Image size={14} aria-hidden="true" />{t('imageProgress').replace('{uploaded}', String(task.uploadedCount)).replace('{total}', String(task.imageCount))}</p> : null}
        {task.error && !compact ? <p className="hint">{t(task.error)}</p> : null}
        {task.permissionOrigin ? <p className="hint">{t('permissionHint')}<br />{task.permissionOrigin}</p> : null}
        <div className="task-actions">
          <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="text-xs">{t(task.site === 'web' ? 'openPage' : task.site === 'arxiv' ? 'openPaper' : task.site === 'hackernews' ? 'openDiscussion' : task.site === 'youtube' || task.site === 'bilibili' ? 'openVideo' : task.site === 'github' ? 'openProject' : 'openSource')}</a>
          {task.status === 'failed' ? <Button variant="outline" size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'retry')}>{t(task.permissionOrigin ? 'grant' : 'retry')}</Button> : null}
          {task.status === 'uncertain' ? <Button variant="outline" size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'reconcile')}><MorphText>{t(busy[task.id] === 'reconcile' ? 'reconciling' : 'reconcile')}</MorphText></Button> : null}
          {!active ? <Button variant="outline" size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'remove')}>{t(busy[task.id] === 'remove' ? 'removingCapture' : 'removeCapture')}</Button> : null}
        </div>
        {feedback[task.id] ? <p className={feedback[task.id]!.error ? 'feedback error' : 'feedback'} role={feedback[task.id]!.error ? 'alert' : 'status'}>{t(feedback[task.id]!.key)}</p> : null}
      </article>;
    })}
  </section>;
}
