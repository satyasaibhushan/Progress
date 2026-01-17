import { HabitType } from "@/lib/generated/prisma"

/**
 * Check if a task is marked as done based on progress
 * A task is done when progress is 100%
 */
export function isTaskDone(progress: number): boolean {
  return progress >= 100
}

/**
 * Check if a habit is completed for today based on logs and type
 */
export function isHabitDoneToday(
  habitType: HabitType,
  targetCount: number | null,
  todaysLogs: { count: number }[]
): boolean {
  const todayCount = todaysLogs.reduce((sum, log) => sum + log.count, 0)

  switch (habitType) {
    case "DAILY":
      return todayCount > 0

    case "N_PER_DAY":
      if (!targetCount) return false
      return todayCount >= targetCount

    case "WEEKLY":
    case "MONTHLY":
      // For weekly/monthly, we consider it done if logged at least once
      return todayCount > 0

    default:
      return false
  }
}

/**
 * Get habit completion percentage for today (useful for N_PER_DAY)
 */
export function getHabitCompletionPercentage(
  habitType: HabitType,
  targetCount: number | null,
  todaysLogs: { count: number }[]
): number {
  const todayCount = todaysLogs.reduce((sum, log) => sum + log.count, 0)

  switch (habitType) {
    case "DAILY":
      return todayCount > 0 ? 100 : 0

    case "N_PER_DAY":
      if (!targetCount) return 0
      return Math.min((todayCount / targetCount) * 100, 100)

    case "WEEKLY":
    case "MONTHLY":
      return todayCount > 0 ? 100 : 0

    default:
      return 0
  }
}

/**
 * Check if a habit is completed for the current week
 */
export function isHabitDoneThisWeek(weekLogs: { count: number }[]): boolean {
  return weekLogs.length > 0
}

/**
 * Check if a habit is completed for the current month
 */
export function isHabitDoneThisMonth(monthLogs: { count: number }[]): boolean {
  return monthLogs.length > 0
}

/**
 * Get today's date range for filtering logs
 */
export function getTodayRange() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  return { startOfDay, endOfDay }
}

/**
 * Get this week's date range for filtering logs
 */
export function getThisWeekRange() {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59, 999)

  return { startOfWeek, endOfWeek }
}

/**
 * Get this month's date range for filtering logs
 */
export function getThisMonthRange() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  startOfMonth.setHours(0, 0, 0, 0)

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  endOfMonth.setHours(23, 59, 59, 999)

  return { startOfMonth, endOfMonth }
}
