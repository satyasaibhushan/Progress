// Shared types for the application

export type ImportancePreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'CUSTOM';

export interface Label {
  id: string;
  name: string;
  color: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  incompleteTaskCount?: number;
  incompleteHabitCount?: number;
  incompleteCount?: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  progress?: number;
  taskCount?: number;
  habitCount?: number;
  incompleteTaskCount?: number;
  incompleteHabitCount?: number;
  incompleteCount?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: number;
  progress: number;
  startDate?: string;
  deadline?: string;
  groupId?: string;
  parentId?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  children?: Task[];
  habits?: Habit[];
  // Aggregate fields for parent task progress calculation
  total_weight?: number | bigint;
  weighted_progress?: number | bigint;
}

export interface Habit {
  id: string;
  title: string;
  description?: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  targetCount: number;
  countPerPeriod?: number; // Used for WEEKLY/MONTHLY/YEARLY habits
  maxCountPerDay?: number; // Max logs allowed per day (defaults to 1)
  importance: number;
  progress?: number;
  startDate?: string;
  endDate?: string;
  activeDays?: number[];
  groupId?: string;
  parentTaskId?: string;
  parentTask?: {
    id: string;
    title: string;
  };
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  labels?: Label[];
  currentCount?: number; // Calculated from logs
  habitLogs?: HabitLog[]; // Logs included when requested via includeLogs
  streak?: number;
  streakPeriod?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  currentPeriodCount?: number;
  currentPeriodTarget?: number;
  currentPeriodComplete?: boolean;
  weeklyDistinctDays?: number;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  count: number;
  createdAt?: string;
  updatedAt?: string;
}
