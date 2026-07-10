import { Task } from "@/types";

export interface CreateTaskInput {
  title: string;
  description?: string;
  importance: number;
  progress?: number;
  startDate?: string;
  deadline?: string;
  groupId?: string;
  parentId?: string;
  labelIds?: string[];
}

export type UpdateTaskInput = {
  id: string;
} & Partial<{
  [K in keyof CreateTaskInput]: CreateTaskInput[K] | null
}>;

export interface TaskFilters {
  parentId?: string | null;
  groupId?: string;
  includeChildren?: boolean;
  includeHabits?: boolean;
}

export type TaskStatus = "active" | "future" | "completed";

export interface TaskPageFilters extends TaskFilters {
  status: TaskStatus;
  limit?: number;
  cursor?: string | null;
  highlightId?: string;
}

export interface TaskPageResult {
  items: Task[];
  nextCursor: string | null;
  hasMore: boolean;
  statusCounts: Record<TaskStatus, number>;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getTasks(filters?: TaskFilters): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.parentId !== undefined) {
    params.append("parentId", filters.parentId === null ? "null" : filters.parentId);
  }
  if (filters?.groupId) {
    params.append("groupId", filters.groupId);
  }
  if (filters?.includeChildren) {
    params.append("include", "children");
  }
  if (filters?.includeHabits === false) {
    params.append("includeHabits", "false");
  }

  const response = await fetch(`/api/tasks?${params.toString()}`);
  return handleResponse<Task[]>(response);
}

export async function getTaskPage(filters: TaskPageFilters): Promise<TaskPageResult> {
  const params = new URLSearchParams();
  params.append("paginate", "true");
  params.append("status", filters.status);
  params.append("limit", String(filters.limit ?? 8));
  if (filters.cursor) {
    params.append("cursor", filters.cursor);
  }
  if (filters.highlightId) {
    params.append("highlightId", filters.highlightId);
  }
  if (filters.parentId !== undefined) {
    params.append("parentId", filters.parentId === null ? "null" : filters.parentId);
  }
  if (filters.groupId) {
    params.append("groupId", filters.groupId);
  }
  if (filters.includeChildren) {
    params.append("include", "children");
  }
  if (filters.includeHabits === false) {
    params.append("includeHabits", "false");
  }

  const response = await fetch(`/api/tasks?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const payload = await response.json();
  const pageInfo = payload.pageInfo || {};
  const statusCounts = payload.statusCounts || { active: 0, future: 0, completed: 0 };
  return {
    items: payload.data || [],
    nextCursor: pageInfo.nextCursor ?? null,
    hasMore: Boolean(pageInfo.hasMore),
    statusCounts,
  };
}

export async function getTask(id: string, includeChildren?: boolean): Promise<Task> {
  const params = new URLSearchParams();
  if (includeChildren) {
    params.append("include", "children");
  }
  const url = `/api/tasks/${id}${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  return handleResponse<Task>(response);
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<Task>(response);
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const { id, ...data } = input;
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Task>(response);
}

export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function addTaskLabel(taskId: string, labelId: string): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labelId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function removeTaskLabel(taskId: string, labelId: string): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/labels`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labelId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}
