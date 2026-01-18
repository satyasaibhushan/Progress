import { HabitType } from "@/lib/generated/prisma"

/**
 * Check if a task is marked as done based on progress
 * A task is done when progress is 100%
 */
export function isTaskDone(progress: number): boolean {
  return progress >= 100
}

/**
 * Check if a habit is completed for today based on logs and countPerPeriod
 */
export function isHabitDoneToday(
  habitType: HabitType,
  countPerPeriod: number,
  todaysLogs: { count: number }[]
): boolean {
  const todayCount = todaysLogs.reduce((sum, log) => sum + log.count, 0)

  switch (habitType) {
    case "DAILY":
      // For daily habits, check if we've hit countPerPeriod
      return todayCount >= countPerPeriod

    case "WEEKLY":
    case "MONTHLY":
      // For weekly/monthly, we consider it done for today if logged at least once
      return todayCount > 0

    default:
      return false
  }
}

/**
 * Get habit completion percentage for today based on countPerPeriod
 */
export function getHabitCompletionPercentage(
  habitType: HabitType,
  countPerPeriod: number,
  todaysLogs: { count: number }[]
): number {
  const todayCount = todaysLogs.reduce((sum, log) => sum + log.count, 0)

  switch (habitType) {
    case "DAILY":
      // For daily habits, percentage is based on countPerPeriod
      return Math.min((todayCount / countPerPeriod) * 100, 100)

    case "WEEKLY":
    case "MONTHLY":
      // For weekly/monthly, today's completion is binary (logged or not)
      return todayCount > 0 ? 100 : 0

    default:
      return 0
  }
}

/**
 * Check if a habit is completed for the current week based on countPerPeriod
 */
export function isHabitDoneThisWeek(
  countPerPeriod: number,
  weekLogs: { count: number }[]
): boolean {
  const weekCount = weekLogs.reduce((sum, log) => sum + log.count, 0)
  return weekCount >= countPerPeriod
}

/**
 * Check if a habit is completed for the current month based on countPerPeriod
 */
export function isHabitDoneThisMonth(
  countPerPeriod: number,
  monthLogs: { count: number }[]
): boolean {
  const monthCount = monthLogs.reduce((sum, log) => sum + log.count, 0)
  return monthCount >= countPerPeriod
}

/**
 * Get period progress for a habit (current day/week/month progress)
 * Returns current count, target, and percentage for the current period
 */
export function getPeriodProgress(
  habitType: HabitType,
  countPerPeriod: number,
  periodLogs: { count: number }[]
): { current: number; target: number; percentage: number } {
  const currentCount = periodLogs.reduce((sum, log) => sum + log.count, 0)
  const percentage = Math.min((currentCount / countPerPeriod) * 100, 100)

  return {
    current: currentCount,
    target: countPerPeriod,
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
  }
}

/**
 * Check if a habit's current period is complete
 */
export function isPeriodComplete(
  habitType: HabitType,
  countPerPeriod: number,
  periodLogs: { count: number }[]
): boolean {
  const currentCount = periodLogs.reduce((sum, log) => sum + log.count, 0)
  return currentCount >= countPerPeriod
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
