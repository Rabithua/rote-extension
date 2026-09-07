import type { CaptureItem } from './capture';
import type { UploadManifest } from '../rote/client';

export interface NoteDefaults { tags: string[]; visibility: 'private' | 'public' }

export type TaskStatus = 'queued' | 'creating' | 'uploading' | 'finalizing' | 'saved' | 'failed' | 'uncertain';
export interface SaveTask {
  id: string;
  configId: string;
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
  id: string;
  sourceId: string;
  sourceUrl: string;
  author: string;
  excerpt: string;
  status: TaskStatus;
  updatedAt: string;
  noteId?: string;
  error?: string;
  permissionOrigin?: string;
  imageCount: number;
  uploadedCount: number;
}
export function taskView(task: SaveTask): TaskView {
  return { id: task.id, sourceId: task.capture.sourceId, sourceUrl: task.capture.sourceUrl,
    author: task.capture.author.name, excerpt: task.capture.text.slice(0,140), status: task.status,
    updatedAt: task.updatedAt, noteId: task.noteId, error: task.error,
    permissionOrigin: task.permissionOrigin, imageCount: task.capture.images.length,
    uploadedCount: Math.max(task.uploaded.length, task.finalized.length) };
}
export const activeStatuses: TaskStatus[] = ['queued', 'creating', 'uploading', 'finalizing'];
