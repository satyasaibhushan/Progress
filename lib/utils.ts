import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert BigInt fields in a task object to strings for JSON serialization
 * Recursively handles nested tasks (children)
 * Transforms taskLabels to labels array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeTask(task: any): any {
  if (!task) return task

  const serialized = { ...task }

  // Convert BigInt fields to strings
  if (serialized.total_weight !== null && serialized.total_weight !== undefined && typeof serialized.total_weight === 'bigint') {
    serialized.total_weight = serialized.total_weight.toString()
  }
  if (serialized.weighted_progress !== null && serialized.weighted_progress !== undefined && typeof serialized.weighted_progress === 'bigint') {
    serialized.weighted_progress = serialized.weighted_progress.toString()
  }

  // Transform taskLabels to labels array
  if (Array.isArray(serialized.taskLabels)) {
    serialized.labels = serialized.taskLabels.map((tl: any) => ({
      id: tl.label.id,
      name: tl.label.name,
      color: tl.label.color,
    }))
    // Remove taskLabels from response (keep labels)
    delete serialized.taskLabels
  }

  // Serialize habits if they exist
  if (Array.isArray(serialized.habits)) {
    serialized.habits = serialized.habits.map((habit: unknown) => serializeHabit(habit))
  }

  // Recursively serialize nested children if they exist
  if (Array.isArray(serialized.children)) {
    serialized.children = serialized.children.map((child: unknown) => serializeTask(child))
  }

  return serialized
}

/**
 * Convert BigInt fields in an array of tasks to strings for JSON serialization
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeTasks(tasks: any[]): any[] {
  return tasks.map((task) => serializeTask(task))
}

/**
 * Transform habitLabels to labels array for habit serialization
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeHabit(habit: any): any {
  if (!habit) return habit

  const serialized = { ...habit }

  // Transform habitLabels to labels array
  if (Array.isArray(serialized.habitLabels)) {
    if (serialized.habitLabels.length > 0) {
      serialized.labels = serialized.habitLabels.map((hl: any) => ({
        id: hl.label.id,
        name: hl.label.name,
        color: hl.label.color,
      }))
    } else {
      // Empty array case
      serialized.labels = []
    }
    // Remove habitLabels from response (keep labels)
    delete serialized.habitLabels
  }

  return serialized
}

/**
 * Serialize an array of habits
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeHabits(habits: any[]): any[] {
  return habits.map((habit) => serializeHabit(habit))
}
