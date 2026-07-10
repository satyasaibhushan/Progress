import { isPending } from "@/lib/date-helpers";
import { Task } from "@/types";
import { TaskStatus } from "@/lib/api/tasks";
import { getAllLeafTasks } from "@/lib/item-metrics";

export interface TaskPageState {
  items: Task[];
  nextCursor: string | null;
  hasMore: boolean;
  initialized: boolean;
  loadingMore: boolean;
}

export const TASKS_PAGE_SIZE = 8;
export const TASK_STATUSES: TaskStatus[] = ["active", "future", "completed"];

export { getAllLeafTasks };

export function isTaskCompleted(task: Task): boolean {
  const leafTasks = getAllLeafTasks([task]);
  if (leafTasks.length === 0) return false;
  return leafTasks.every((leafTask) => {
    const taskProgress = leafTask.progress || 0;
    return taskProgress >= 100;
  });
}

export function createEmptyTaskPageState(): TaskPageState {
  return {
    items: [],
    nextCursor: null,
    hasMore: true,
    initialized: false,
    loadingMore: false,
  };
}

export function mergeUniqueTasksById(existing: Task[], incoming: Task[]): Task[] {
  const merged: Task[] = [];
  const seen = new Set<string>();

  for (const task of [...existing, ...incoming]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }

  return merged;
}

export function getTaskStatus(task: Task): TaskStatus {
  const progress = Math.min(100, Math.max(0, task.progress || 0));
  if (progress >= 100) return "completed";
  if (isPending(task.startDate)) return "future";
  return "active";
}
