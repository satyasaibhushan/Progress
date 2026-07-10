import { calculateLabelStats } from "@/app/(dashboard)/labels/_lib/label-page-helpers"
import type { Habit, Task } from "@/types"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const linkedHabit: Habit = {
  id: "habit-1",
  title: "Linked habit",
  type: "DAILY",
  targetCount: 2,
  importance: 50,
  currentCount: 0,
  habitLogs: [
    { id: "log-1", habitId: "habit-1", date: "2026-07-10", count: 2 },
  ],
}

const taskWithHabit: Task = {
  id: "task-1",
  title: "Task represented by its habit",
  importance: 50,
  progress: 100,
  habits: [linkedHabit],
}

const summary = calculateLabelStats([taskWithHabit], [linkedHabit])
assertEqual(summary.tasksCount, 0, "a task with a linked habit is not a leaf")
assertEqual(summary.habitsCount, 1, "the linked habit is counted")
assertEqual(summary.completedItems, 1, "completed habits are included")
assertEqual(summary.avgHabitProgress, 100, "habit logs override a stale cached count")
