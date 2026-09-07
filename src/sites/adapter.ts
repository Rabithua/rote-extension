import type { CaptureItem } from '../domain/capture';
import type { TaskView } from '../domain/task';
export interface AdapterBridge {
  save(capture: CaptureItem): Promise<TaskView | undefined>;
  status(sourceId: string): Promise<TaskView | undefined>;
  openSettings(): Promise<void>;
}
export interface SiteAdapter {
  readonly site: string;
  mount(): void;
  dispose(): void;
  update(task: TaskView): void;
}
