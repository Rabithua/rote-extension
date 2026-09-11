import { languageFor, type Language } from '../locales/messages';
import { MorphText } from './MorphText';
import { StatusIcon } from './StatusIcon';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'lucide-react';
import type { TaskView } from '../domain/task';
import { send } from '../messaging/protocol';
import { Button } from './button';

export function TaskList({ tasks, t, reload, compact = false, language = languageFor() }: { tasks: TaskView[]; t: (key: string) => string; reload: () => Promise<void>; compact?: boolean; language?: Language }) {
  type Action = 'retry' | 'reconcile' | 'remove' | 'restore' | 'cancel' | 'recreate';
  const [removed, setRemoved] = useState<TaskView | null>(null);
  useEffect(() => { if (!removed) return; const timer = setTimeout(() => setRemoved(null), 30_000); return () => clearTimeout(timer); }, [removed]);
  const [feedback, setFeedback] = useState<Record<string, { key: string; error: boolean }>>({});
  const [busy, setBusy] = useState<Record<string, Action>>({});
  const pending = useRef(new Set<string>());
  async function act(task: TaskView, action: Action) {
    if (pending.current.has(task.id)) return;
    pending.current.add(task.id);
    setFeedback(current => { const next = { ...current }; delete next[task.id]; return next; });
    setBusy(current => ({ ...current, [task.id]: action }));
    try {
      if (task.permissionOrigin && action === 'retry') {
        if (!await chrome.permissions.request({ origins: [`${task.permissionOrigin}/*`] })) throw new Error('permissionsDenied');
      }
      let result;
      if (action === 'recreate') {
        result = await send({ type: 'tasks:recreate', id: task.id, confirmed: false });
        if (result.reconciliation !== 'matched') {
          if (!window.confirm(t(task.status === 'uncertain' ? 'recreateConfirm' : 'saveCopyConfirm'))) return;
          result = await send({ type: 'tasks:recreate', id: task.id, confirmed: true });
        }
      } else result = await send({ type: `tasks:${action}`, id: task.id });
      if (result.reconciliation) setFeedback(current => ({ ...current, [task.id]: { key: `reconcile_${result.reconciliation}`, error: false } }));
      if (action === 'remove') setRemoved(task);
      if (action === 'restore') setRemoved(null);
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
    {removed ? <div className="feedback" role="status">{t('captureRemoved')} <Button size="sm" variant="outline" disabled={!!busy[removed.id]} onClick={() => void act(removed, 'restore')}>{t('undo')}</Button>{feedback[removed.id]?.error ? <p role="alert">{t(feedback[removed.id]!.key)}</p> : null}</div> : null}
    {!tasks.length ? <div className="empty"><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p><p className="hint">{t('captureDefaultsHint')}</p></div> : null}
    {(compact ? tasks.slice(0,3) : tasks).map(task => {
      const active = ['queued','creating','uploading','finalizing'].includes(task.status);
      const status = task.error === 'note_missing' ? 'needsAction' : task.status === 'waiting' ? 'waiting' : task.status === 'cancelled' ? task.noteId ? 'cancelledPartial' : 'cancelled' : task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'uncertain' : task.status === 'failed' ? task.noteId ? 'partial' : 'failed' : 'saving';
      return <article className="task" key={task.id}>
        <div className="task-head"><h3 className="task-title">{task.author}</h3><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en', { hour:'2-digit',minute:'2-digit' })}</time></div>
        {task.excerpt ? <p>{task.excerpt}</p> : null}
        <div className="status"><StatusIcon state={task.status === 'saved' ? 'saved' : active ? 'saving' : 'error'} /><MorphText>{t(status)}</MorphText></div>
        {task.imageCount ? <p className="status"><Image size={14} aria-hidden="true" />{t('imageProgress').replace('{uploaded}', String(task.uploadedCount)).replace('{total}', String(task.imageCount))}</p> : null}
        {task.error && !compact ? <p className="hint">{t(task.error)}</p> : null}
        {task.nextRetryAt ? <p className="hint">{t('retryAt')} {new Date(task.nextRetryAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en')}</p> : null}
        {task.permissionOrigin ? <p className="hint">{t('permissionHint')}<br />{task.permissionOrigin}</p> : null}
        <div className="task-actions">
          <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="text-xs">{t(task.site === 'web' ? 'openPage' : task.site === 'arxiv' ? 'openPaper' : task.site === 'hackernews' ? 'openDiscussion' : task.site === 'youtube' || task.site === 'bilibili' ? 'openVideo' : task.site === 'github' ? 'openProject' : 'openSource')}</a>
          {task.status === 'failed' || task.status === 'waiting' || task.status === 'cancelled' || task.status === 'uncertain' && task.canReplay && !task.cancelRequested ? <Button variant={task.status === 'uncertain' ? 'default' : 'outline'} size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'retry')}><MorphText>{t(busy[task.id] === 'retry' ? 'retryingSave' : task.permissionOrigin ? 'grant' : task.status === 'uncertain' ? 'retrySave' : 'retry')}</MorphText></Button> : null}
          {task.status === 'uncertain' ? <Button variant="outline" size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'reconcile')}><MorphText>{t(busy[task.id] === 'reconcile' ? 'reconciling' : 'reconcile')}</MorphText></Button> : null}
          {task.noteId ? task.noteUrl ? <a className="text-xs" href={task.noteUrl} target="_blank" rel="noreferrer">{t('viewNote')}</a> : <Button size="sm" variant="outline" onClick={() => document.getElementById('webUrl')?.focus()}>{t('configureWebUrl')}</Button> : null}
          {task.status === 'saved' || task.status === 'uncertain' || task.error === 'note_missing' ? <Button size="sm" variant="outline" disabled={!!busy[task.id]} onClick={() => void act(task, 'recreate')}>{t(task.status === 'saved' ? 'saveCopy' : 'recreate')}</Button> : null}
          {active || task.status === 'waiting' ? <Button size="sm" variant="outline" disabled={!!busy[task.id] || task.cancelRequested} onClick={() => void act(task, 'cancel')}>{t(task.cancelRequested ? 'cancelling' : 'cancelSave')}</Button> : null}
          {!active && task.status !== 'waiting' ? <Button variant="outline" size="sm" disabled={!!busy[task.id]} onClick={() => void act(task,'remove')}>{t(busy[task.id] === 'remove' ? 'removingCapture' : 'removeCapture')}</Button> : null}
        </div>
        {feedback[task.id] ? <p className={feedback[task.id]!.error ? 'feedback error' : 'feedback'} role={feedback[task.id]!.error ? 'alert' : 'status'}>{t(feedback[task.id]!.key)}</p> : null}
      </article>;
    })}
  </section>;
}
