import { z } from "zod";
import { Habit, Task } from "@/types";
import { getAllLeafTasks, getHabitProgress } from "@/lib/item-metrics";

export const COLOR_OPTIONS = [
  "#ef4444",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export const labelFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name too long"),
  color: z.string().min(1, "Color is required"),
});

export type LabelFormValues = z.infer<typeof labelFormSchema>;

export { getAllLeafTasks };

export interface LabelStatsSummary {
  totalItems: number;
  tasksCount: number;
  habitsCount: number;
  completedItems: number;
  avgTaskProgress: number;
  avgHabitProgress: number;
}

export function calculateLabelStats(tasks: Task[], habits: Habit[]): LabelStatsSummary {
  const allLeafTasks = getAllLeafTasks(tasks);
  const totalItems = allLeafTasks.length + habits.length;
  const completedItems =
    allLeafTasks.filter((task) => task.progress >= 100).length +
    habits.filter((habit) => getHabitProgress(habit) >= 100).length;
  const avgTaskProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((accumulator, task) => accumulator + task.progress, 0) / allLeafTasks.length
        )
      : 0;

  const avgHabitProgress =
    habits.length > 0
      ? Math.round(
          habits.reduce((accumulator, habit) => accumulator + getHabitProgress(habit), 0) /
            habits.length
        )
      : 0;

  return {
    totalItems,
    tasksCount: allLeafTasks.length,
    habitsCount: habits.length,
    completedItems,
    avgTaskProgress,
    avgHabitProgress,
  };
}
