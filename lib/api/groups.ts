import { Group, Habit, Task } from "@/types";

export interface CreateGroupInput {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateGroupInput extends Partial<CreateGroupInput> {
  id: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export interface GroupFilters {
  limit?: number;
}

export async function getGroups(filters?: GroupFilters): Promise<Group[]> {
  const params = new URLSearchParams();
  if (filters?.limit) {
    params.append("limit", filters.limit.toString());
  }
  const url = params.toString() ? `/api/groups?${params.toString()}` : "/api/groups";
  const response = await fetch(url);
  return handleResponse<Group[]>(response);
}

export async function getGroup(id: string): Promise<Group> {
  const response = await fetch(`/api/groups/${id}`);
  return handleResponse<Group>(response);
}

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<Group>(response);
}

export async function updateGroup(input: UpdateGroupInput): Promise<Group> {
  const { id, ...data } = input;
  const response = await fetch(`/api/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Group>(response);
}

export async function deleteGroup(id: string): Promise<void> {
  const response = await fetch(`/api/groups/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export interface GroupItems {
  tasks: Task[];
  habits: Habit[];
}

export async function getGroupItems(id: string): Promise<GroupItems> {
  const response = await fetch(`/api/groups/${id}/items`);
  return handleResponse<GroupItems>(response);
}
