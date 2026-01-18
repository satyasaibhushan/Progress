import { Label, Task, Habit } from "@/types";

export interface CreateLabelInput {
  name: string;
  color?: string;
}

export interface UpdateLabelInput extends Partial<CreateLabelInput> {
  id: string;
}

export interface LabelItems {
  tasks: Task[];
  habits: Habit[];
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getLabels(): Promise<Label[]> {
  const response = await fetch("/api/labels");
  return handleResponse<Label[]>(response);
}

export async function getLabel(id: string): Promise<Label> {
  const response = await fetch(`/api/labels/${id}`);
  return handleResponse<Label>(response);
}

export async function createLabel(input: CreateLabelInput): Promise<Label> {
  const response = await fetch("/api/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<Label>(response);
}

export async function updateLabel(input: UpdateLabelInput): Promise<Label> {
  const { id, ...data } = input;
  const response = await fetch(`/api/labels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Label>(response);
}

export async function deleteLabel(id: string): Promise<void> {
  const response = await fetch(`/api/labels/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function getLabelItems(id: string): Promise<LabelItems> {
  const response = await fetch(`/api/labels/${id}/items`);
  return handleResponse<LabelItems>(response);
}
