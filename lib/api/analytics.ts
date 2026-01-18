// Analytics API client
// Note: These endpoints may not be fully implemented yet

export interface OverviewStats {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  avgProgress: number;
  tasksThisWeek: number;
  overdueTasks: number;
  activeHabits: number;
  habitsOnTrack: number;
  habitCompletionRate: number;
}

export interface ProgressByGroup {
  groupId: string;
  groupName: string;
  groupColor?: string;
  avgProgress: number;
  taskCount: number;
}

export interface ProgressByLabel {
  labelId: string;
  labelName: string;
  labelColor?: string;
  avgProgress: number;
  taskCount: number;
  habitCount: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data.data || data;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const response = await fetch("/api/analytics/overview");
  return handleResponse<OverviewStats>(response);
}

export async function getProgressByGroup(): Promise<ProgressByGroup[]> {
  const response = await fetch("/api/analytics/by-group");
  return handleResponse<ProgressByGroup[]>(response);
}

export async function getProgressByLabel(): Promise<ProgressByLabel[]> {
  const response = await fetch("/api/analytics/by-label");
  return handleResponse<ProgressByLabel[]>(response);
}
