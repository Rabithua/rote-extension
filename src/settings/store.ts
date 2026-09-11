import { z } from 'zod';

export const settingsSchema = z.object({
  apiUrl: z.string().url().transform(normalizeApiUrl),
  openKey: z.string().trim().uuid(),
  webUrl: z.string().transform(value => value.trim() ? normalizeWebUrl(value) : '').optional(),
  language: z.enum(['system', 'zh', 'en']),
  theme: z.enum(['system', 'light', 'dark']),
  defaultTags: z.array(z.string().trim().min(1).max(50)).max(20).transform(tags => [...new Set(tags)]).default([]),
  addPlatformTag: z.boolean().default(false),
  defaultArchived: z.boolean().default(false),
  defaultVisibility: z.enum(['private', 'public']).default('private'),
});
export const storedSettingsSchema = settingsSchema.extend({ id: z.string(), credentialId: z.string().optional(), migrationFrom: z.array(z.string()).optional(), ownerId: z.string().uuid().optional(), noteCreateIdempotency: z.literal(1).optional() });
export type SettingsInput = z.input<typeof settingsSchema>;
export type Settings = z.output<typeof storedSettingsSchema>;
export function normalizeApiUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error('invalid_address');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('invalid_address');
  if (url.origin === 'https://rote.ink' && url.pathname === '/') url.hostname = 'api.rote.ink';
  return url.href.replace(/\/+$/, '');
}
export async function configIdentity(apiUrl: string, openKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${apiUrl}\n${openKey}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function protectStorage() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
export async function readSettings(): Promise<Settings | null> {
  const { settings } = await chrome.storage.local.get('settings');
  return settings ? storedSettingsSchema.parse(settings) : null;
}
export async function writeSettings(input: SettingsInput, identity?: { ownerId?: string; noteCreateIdempotency?: 1 }): Promise<Settings> {
  const parsed = settingsSchema.parse(input);
  const previous = await readSettings();
  const ownerId = identity?.ownerId ?? (previous?.apiUrl === parsed.apiUrl && previous.openKey === parsed.openKey ? previous.ownerId : undefined);
  const id = await configIdentity(parsed.apiUrl, ownerId ?? parsed.openKey);
  const sameOwner = ownerId && previous?.apiUrl === parsed.apiUrl &&
    (previous.ownerId ? previous.ownerId === ownerId : previous.openKey === parsed.openKey);
  const migrationFrom = sameOwner ? [...new Set([...(previous.migrationFrom ?? []), ...(previous.id !== id ? [previous.id] : [])])] : [];
  const settings = { ...parsed, ...identity, ownerId, credentialId: await configIdentity(parsed.apiUrl, parsed.openKey), id, migrationFrom };
  await protectStorage();
  await chrome.storage.local.set({ settings });
  return settings;
}
export const originPattern = (url: string) => `${new URL(url).origin}/*`;

export function parseDefaultTags(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map(tag => tag.trim().replace(/^#+/, '').trim()).filter(Boolean))];
}

export function normalizeWebUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('invalid_address');
  return url.href.replace(/\/+$/, '');
}
export function noteUrl(settings: Settings, id: string): string | undefined {
  const base = settings.webUrl || (settings.apiUrl === 'https://api.rote.ink' ? 'https://rote.ink' : undefined);
  return base ? `${base}/rote/${encodeURIComponent(id)}` : undefined;
}
