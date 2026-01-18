import { Task } from "@/types";

export interface CreateTaskInput {
  title: string;
  description?: string;
  importance: number;
  progress?: number;
  deadline?: string;
  groupId?: string;
  parentId?: string;
  labelIds?: string[];
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  id: string;
}

export interface TaskFilters {
  parentId?: string | null;
  groupId?: string;
  includeChildren?: boolean;
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

  const response = await fetch(`/api/tasks?${params.toString()}`);
  return handleResponse<Task[]>(response);
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
  const response = await fetch(`/api/tasks/${taskId}/labels?labelId=${labelId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}
