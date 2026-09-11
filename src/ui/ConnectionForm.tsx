import { MorphText } from './MorphText';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Button } from './button';
import { Switch } from './switch';
import { captureTags } from '../domain/tags';
import { Input } from './input';
import { normalizeApiUrl, originPattern, parseDefaultTags, type Settings, type SettingsInput } from '../settings/store';
import { send } from '../messaging/protocol';

export function ConnectionForm({ settings, onSaved, t }: { settings: Settings | null; onSaved: (settings: Settings) => void; t: (key: string) => string }) {
  const [apiUrl, setApiUrl] = useState(settings?.apiUrl ?? 'https://rote.ink');
  const [webUrl, setWebUrl] = useState(settings?.webUrl ?? '');
  const [openKey, setOpenKey] = useState(settings?.openKey ?? '');
  const [language, setLanguage] = useState<SettingsInput['language']>(settings?.language ?? 'system');
  const [theme, setTheme] = useState<SettingsInput['theme']>(settings?.theme ?? 'system');
  const [defaultTags, setDefaultTags] = useState(settings?.defaultTags?.join(', ') ?? '');
  const [addPlatformTag, setAddPlatformTag] = useState(settings?.addPlatformTag ?? false);
  const [defaultVisibility, setDefaultVisibility] = useState<'private' | 'public'>(settings?.defaultVisibility ?? 'private');
  const [defaultArchived, setDefaultArchived] = useState(settings?.defaultArchived ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSaved(false);
    let normalized: string;
    try { normalized = normalizeApiUrl(apiUrl); } catch { setError('invalid_address'); return; }
    const tags = parseDefaultTags(defaultTags);
    try { captureTags('x', { defaultTags: tags, addPlatformTag }); } catch { setError('tag_limit'); return; }
    setBusy(true);
    try {
      // Permission request starts directly in the user's click gesture, before any network await.
      if (!await chrome.permissions.request({ origins: [originPattern(normalized)] })) throw new Error('permissionsDenied');
      const result = await send({ type: 'settings:save', settings: { apiUrl: normalized, webUrl, openKey, language, theme, defaultTags: tags, addPlatformTag, defaultVisibility, defaultArchived } });
      if (result.settings) { onSaved(result.settings); setSaved(true); }
    } catch (error) { setError(error instanceof Error ? error.message : 'save_failed'); }
    finally { setBusy(false); }
  }
  return <section className="section" aria-labelledby="connection-heading">
    <h2 id="connection-heading">{t('settings')}</h2>
    <p className="section-intro">{t('connectionHint')}</p>
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="apiUrl">{t('apiUrl')}</label><Input id="apiUrl" type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} required autoComplete="url" /></div>
      <div className="field"><label htmlFor="webUrl">{t('webUrl')}</label><Input id="webUrl" type="url" value={webUrl} onChange={e => setWebUrl(e.target.value)} /><p className="hint">{t('webUrlHint')}</p></div>
      <div className="field"><label htmlFor="openKey">{t('openKey')}</label><Input id="openKey" type="password" value={openKey} onChange={e => setOpenKey(e.target.value)} required autoComplete="off" spellCheck={false} aria-describedby="key-hint" /><p className="hint" id="key-hint">{t('keyHint')}</p></div>
      <div className="field"><label htmlFor="defaultTags">{t('defaultTags')}</label><Input id="defaultTags" value={defaultTags} onChange={e => setDefaultTags(e.target.value)} aria-describedby="tags-hint" /><p className="hint" id="tags-hint">{t('tagsHint')}</p></div>
      <div className="field">
        <div className="platform-tag-toggle"><label htmlFor="addPlatformTag">{t('addPlatformTag')}</label><Switch id="addPlatformTag" checked={addPlatformTag} onCheckedChange={setAddPlatformTag} aria-describedby="platform-tag-hint" /></div>
        <p className="hint" id="platform-tag-hint">{t('platformTagHint')}</p>
      </div>
      <div className="field"><label htmlFor="defaultVisibility">{t('defaultVisibility')}</label><select id="defaultVisibility" value={defaultVisibility} onChange={e => setDefaultVisibility(e.target.value as 'private' | 'public')} aria-describedby="visibility-hint"><option value="private">{t('visibilityPrivate')}</option><option value="public">{t('visibilityPublic')}</option></select><p className="hint" id="visibility-hint">{t(defaultVisibility === 'public' ? 'publicHint' : 'privateHint')}</p></div>
      <div className="field">
        <div className="platform-tag-toggle"><label htmlFor="defaultArchived">{t('defaultArchived')}</label><Switch id="defaultArchived" checked={defaultArchived} onCheckedChange={setDefaultArchived} aria-describedby="archive-hint" /></div>
        <p className="hint" id="archive-hint">{t('archiveHint')}</p>
      </div>
      <div className="preferences">
        <div className="field"><label htmlFor="language">{t('language')}</label><select id="language" value={language} onChange={e => setLanguage(e.target.value as SettingsInput['language'])}><option value="system">{t('system')}</option><option value="zh">简体中文</option><option value="en">English</option></select></div>
        <div className="field"><label htmlFor="theme">{t('theme')}</label><select id="theme" value={theme} onChange={e => setTheme(e.target.value as SettingsInput['theme'])}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></div>
      </div>
      <div className="actions">{saved || settings ? <span className="status" role="status"><Check size={14} />{t('connected')}</span> : null}<Button type="submit" disabled={busy}><MorphText>{t(busy ? 'connecting' : settings ? 'saveSettings' : 'connect')}</MorphText></Button></div>
      {error ? <p className="feedback error" role="alert">{t(error)}</p> : null}
    </form>
  </section>;
}
