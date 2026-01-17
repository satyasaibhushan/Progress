import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert BigInt fields in a task object to strings for JSON serialization
 * Recursively handles nested tasks (children)
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
