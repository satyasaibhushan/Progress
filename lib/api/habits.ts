import { Habit, HabitLog } from "@/types";

export interface CreateHabitInput {
  title: string;
  description?: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY";
  targetCount: number;
  importance: number;
  endDate?: string;
  activeDays?: number[];
  groupId?: string;
  parentTaskId?: string;
  labelIds?: string[];
}

export interface UpdateHabitInput extends Partial<CreateHabitInput> {
  id: string;
}

export interface HabitFilters {
  type?: "DAILY" | "WEEKLY" | "MONTHLY";
  groupId?: string;
  parentTaskId?: string;
  includeLogs?: boolean;
}

export interface LogHabitInput {
  date?: string;
  count?: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getHabits(filters?: HabitFilters): Promise<Habit[]> {
  const params = new URLSearchParams();
  if (filters?.type) {
    params.append("type", filters.type);
  }
  if (filters?.groupId) {
    params.append("groupId", filters.groupId);
  }
  if (filters?.parentTaskId) {
    params.append("parentTaskId", filters.parentTaskId);
  }
  if (filters?.includeLogs) {
    params.append("includeLogs", "true");
  }

  const response = await fetch(`/api/habits?${params.toString()}`);
  return handleResponse<Habit[]>(response);
}

export async function getHabit(id: string): Promise<Habit> {
  const response = await fetch(`/api/habits/${id}`);
  return handleResponse<Habit>(response);
}

export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  const response = await fetch("/api/habits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<Habit>(response);
}

export async function updateHabit(input: UpdateHabitInput): Promise<Habit> {
  const { id, ...data } = input;
  const response = await fetch(`/api/habits/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Habit>(response);
}

export async function deleteHabit(id: string): Promise<void> {
  const response = await fetch(`/api/habits/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function logHabit(habitId: string, input?: LogHabitInput): Promise<HabitLog> {
  const response = await fetch(`/api/habits/${habitId}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input || {}),
  });
  return handleResponse<HabitLog>(response);
}

export async function getHabitLogs(
  habitId: string,
  startDate?: string,
  endDate?: string
): Promise<HabitLog[]> {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  const response = await fetch(`/api/habits/${habitId}/log?${params.toString()}`);
  return handleResponse<HabitLog[]>(response);
}

export async function deleteHabitLog(habitId: string, logId: string): Promise<void> {
  const response = await fetch(`/api/habits/${habitId}/log`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function updateHabitLogCount(habitId: string, logId: string, count: number): Promise<void> {
  const response = await fetch(`/api/habits/${habitId}/log`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logId, count }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function addHabitLabel(habitId: string, labelId: string): Promise<void> {
  const response = await fetch(`/api/habits/${habitId}/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labelId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}

export async function removeHabitLabel(habitId: string, labelId: string): Promise<void> {
  const response = await fetch(`/api/habits/${habitId}/labels?labelId=${labelId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
}
