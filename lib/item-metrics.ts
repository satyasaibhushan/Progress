import type { Habit, Task } from "@/types"

export function clampProgress(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function getAllLeafTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => {
    if (task.children && task.children.length > 0) {
      return getAllLeafTasks(task.children)
    }
    return task.habits && task.habits.length > 0 ? [] : [task]
  })
}

export function getHabitProgress(habit: Habit): number {
  // API responses include an authoritative progress value calculated from all
  // logs. Some detail endpoints only embed a recent log window, so prefer the
  // aggregate when it is present instead of undercounting older logs.
  if (typeof habit.progress === "number" && Number.isFinite(habit.progress)) {
    return clampProgress(habit.progress)
  }

  if (Array.isArray(habit.habitLogs)) {
    const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0)
    if (habit.targetCount <= 0) return 0
    return clampProgress(Math.round((totalCount / habit.targetCount) * 100))
  }

  if (typeof habit.progress === "number") {
    return clampProgress(habit.progress)
  }

  if (habit.targetCount <= 0) return 0
  return clampProgress(Math.round(((habit.currentCount || 0) / habit.targetCount) * 100))
}
