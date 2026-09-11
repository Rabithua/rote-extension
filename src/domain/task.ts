import type { CaptureItem } from './capture';
import type { UploadManifest } from '../rote/client';

export interface NoteDefaults { tags: string[]; visibility: 'private' | 'public'; archived?: boolean }

export type TaskStatus = 'queued' | 'creating' | 'uploading' | 'finalizing' | 'saved' | 'failed' | 'uncertain' | 'waiting' | 'cancelled';
export interface SaveTask {
  id: string;
  configId: string;
  sourceKey?: string;
  createId?: string;
  createProtocol?: 1;
  creation?: 'pending' | 'sent' | 'confirmed' | 'rejected';
  revision?: number;
  operationId?: string;
  retryCount?: number;
  nextRetryAt?: number;
  cancelRequested?: boolean;
  hiddenAt?: number;
  compacted?: boolean;
  replacementId?: string;
  capture: CaptureItem;
  noteDefaults?: NoteDefaults;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  noteId?: string;
  error?: string;
  permissionOrigin?: string;
  batches: UploadManifest[];
  finalized: string[];
  uploaded: string[];
}
export interface TaskView {
  revision?: number;
  site: CaptureItem['site'];
  id: string;
  sourceId: string;
  sourceUrl: string;
  author: string;
  excerpt: string;
  status: TaskStatus;
  updatedAt: string;
  noteId?: string;
  noteUrl?: string;
  nextRetryAt?: number;
  canReplay?: boolean;
  cancelRequested?: boolean;
  error?: string;
  permissionOrigin?: string;
  imageCount: number;
  uploadedCount: number;
}
export function taskView(task: SaveTask): TaskView {
  return { revision: task.revision, site: task.capture.site, id: task.id, sourceId: task.capture.sourceId, sourceUrl: task.capture.sourceUrl,
    author: task.capture.site === 'x' ? task.capture.author.name : task.capture.site === 'github' ? task.capture.repository : task.capture.title,
    excerpt: task.capture.site === 'youtube' ? task.capture.channel : task.capture.site === 'bilibili' ? task.capture.byline : task.capture.text.slice(0,140), status: task.status,
    updatedAt: task.updatedAt, noteId: task.noteId, error: task.error, nextRetryAt: task.nextRetryAt, canReplay: task.createProtocol === 1, cancelRequested: task.cancelRequested,
    permissionOrigin: task.permissionOrigin, imageCount: task.capture.images.length,
    uploadedCount: Math.max(task.uploaded.length, task.finalized.length) };
}
export const activeStatuses: TaskStatus[] = ['queued', 'creating', 'uploading', 'finalizing'];

export type ReconciliationResult = 'matched' | 'not_found' | 'ambiguous' | 'mismatch' | 'unavailable';

export const sourceKey = (capture: CaptureItem) => `${capture.site}:${capture.sourceId}`;
