import { parseISO } from "date-fns";
import { HabitStatus } from "@/lib/api/habits";
import { Habit } from "@/types";

export function getHabitProgressValue(habit: Habit): number {
  const progress = typeof habit.progress === "number" ? habit.progress : 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getUtcDateKeyFromIso(isoDate: string): string {
  const parsed = parseISO(isoDate);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getProgressFromCounts(currentCount: number, targetCount: number): number {
  if (!targetCount) return 0;
  return Math.min(100, Math.max(0, Math.round((currentCount / targetCount) * 100)));
}

export function getHabitStatus(habit: Habit): HabitStatus {
  const progress = getHabitProgressValue(habit);
  if (progress >= 100) return "completed";

  if (habit.startDate) {
    const startDate = parseISO(habit.startDate);
    if (Number.isNaN(startDate.getTime())) return "active";
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate > today) return "future";
  }

  return "active";
}

export function getStreakLabel(period?: Habit["type"]): string {
  if (period === "WEEKLY") return "weeks";
  if (period === "MONTHLY") return "months";
  if (period === "YEARLY") return "years";
  return "days";
}

export interface HabitPageState {
  items: Habit[];
  nextCursor: string | null;
  hasMore: boolean;
  initialized: boolean;
  loadingMore: boolean;
}

export function createEmptyHabitPageState(): HabitPageState {
  return {
    items: [],
    nextCursor: null,
    hasMore: true,
    initialized: false,
    loadingMore: false,
  };
}

export const HABITS_PAGE_SIZE = 10;
export const HABIT_STATUSES: HabitStatus[] = ["active", "future", "completed"];

export function mergeUniqueHabitsById(existing: Habit[], incoming: Habit[]): Habit[] {
  const merged: Habit[] = [];
  const seen = new Set<string>();

  for (const habit of [...existing, ...incoming]) {
    if (seen.has(habit.id)) continue;
    seen.add(habit.id);
    merged.push(habit);
  }

  return merged;
}

export interface HabitFormPayload {
  title: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  targetCount?: number | null;
  countPerPeriod?: number;
  maxCountPerDay?: number;
  importance?: number;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  activeDays?: number[] | null;
  groupId?: string | null;
  parentTaskId?: string | null;
  labelIds?: string[];
}
