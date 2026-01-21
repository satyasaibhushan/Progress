import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a date string flexibly - accepts any text and tries to parse it as a date
 * Supports formats: dd/mm/yy, dd-mm-yy, dd-mm-yyyy, and standard date formats
 * Returns ISO datetime string if valid, null if invalid or empty
 * Rejects dates more than 2 years in the future
 */
export function parseDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  
  const trimmed = dateStr.trim()
  if (trimmed === '') return null
  
  let date: Date | null = null
  
  // Try to parse dd/mm/yy, dd-mm-yy, or dd-mm-yyyy formats first
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
  
  if (slashMatch || dashMatch) {
    const match = slashMatch || dashMatch
    if (match) {
      const day = parseInt(match[1], 10)
      const month = parseInt(match[2], 10)
      let year = parseInt(match[3], 10)
      
      // Handle 2-digit years: assume 20xx for years 00-99
      if (year < 100) {
        year = 2000 + year
      }
      
      // Validate day and month ranges
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        // Create date (month is 0-indexed in Date constructor)
        date = new Date(year, month - 1, day)
        
        // Verify the date is valid (handles cases like 31/02/26)
        if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
          date = null
        }
      }
    }
  }
  
  // If not matched by dd/mm/yy format, try standard Date parsing
  if (!date) {
    date = new Date(trimmed)
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return null
    }
  }
  
  // Check if date is more than 2 years in the future
  const twoYearsFromNow = new Date()
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2)
  twoYearsFromNow.setHours(23, 59, 59, 999) // End of day
  
  if (date > twoYearsFromNow) {
    return null
  }
  
  // Return ISO string
  return date.toISOString()
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
