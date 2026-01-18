import { Group } from "@/types";

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

export async function getGroups(): Promise<Group[]> {
  const response = await fetch("/api/groups");
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
