// Shared types for the application

export type ImportancePreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'CUSTOM';

export interface Label {
  id: string;
  name: string;
  color: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: number;
  progress: number;
  deadline?: string;
  groupId?: string;
  parentId?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  children?: Task[];
  habits?: Habit[];
}

export interface Habit {
  id: string;
  title: string;
  description?: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  targetCount: number;
  countPerPeriod?: number; // How many times per period (defaults to 1)
  importance: number;
  endDate?: string;
  activeDays?: number[];
  groupId?: string;
  parentTaskId?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  currentCount?: number; // Calculated from logs
  habitLogs?: HabitLog[]; // Logs included when requested via includeLogs
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  count: number;
  createdAt?: string;
  updatedAt?: string;
}
