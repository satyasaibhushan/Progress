import { z } from "zod";
import { Habit, Task } from "@/types";

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
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  color: z.string().min(1, "Color is required"),
});

export type LabelFormValues = z.infer<typeof labelFormSchema>;

export function getAllLeafTasks(tasks: Task[]): Task[] {
  const leafTasks: Task[] = [];
  const traverse = (taskList: Task[]) => {
    taskList.forEach((task) => {
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      } else {
        leafTasks.push(task);
      }
    });
  };
  traverse(tasks);
  return leafTasks;
}

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
  const completedItems = allLeafTasks.filter((task) => task.progress === 100).length;
  const avgTaskProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((accumulator, task) => accumulator + task.progress, 0) / allLeafTasks.length
        )
      : 0;

  const avgHabitProgress =
    habits.length > 0
      ? Math.round(
          habits.reduce((accumulator, habit) => {
            let habitProgress = 0;
            if (habit.habitLogs && habit.habitLogs.length > 0) {
              const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0);
              if (habit.targetCount > 0) {
                habitProgress = Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
              }
            } else if (habit.currentCount !== undefined && habit.targetCount) {
              habitProgress = Math.min(100, Math.round((habit.currentCount / habit.targetCount) * 100));
            }
            return accumulator + habitProgress;
          }, 0) / habits.length
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
