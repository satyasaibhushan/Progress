import { HabitType } from "./generated/prisma"

/**
 * Calculate targetCount from endDate if not provided
 * 
 * @param type - Habit type (DAILY, WEEKLY, MONTHLY)
 * @param endDate - End date of the habit
 * @param activeDays - Active days for WEEKLY habits (0=Sun, 1=Mon, ..., 6=Sat)
 * @param createdAt - When the habit was created (defaults to now)
 * @returns Calculated targetCount or null if cannot be calculated
 */
export function calculateTargetCount(
  type: HabitType,
  endDate: Date | null | undefined,
  activeDays: number[] | null | undefined = null,
  createdAt: Date = new Date()
): number | null {
  if (!endDate) {
    return null; // Cannot auto-calculate without endDate
  }

  const startDate = new Date(createdAt)
  startDate.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  // Calculate days between start and end
  const diffTime = end.getTime() - startDate.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) {
    return null; // Invalid date range
  }

  switch (type) {
    case HabitType.DAILY:
      // For daily habits, assume 1 log per day
      // Could be adjusted based on a "perDayCount" if needed, but for now: 1 per day
      return diffDays

    case HabitType.WEEKLY:
      // For weekly habits, count active days within the period
      if (!activeDays || activeDays.length === 0) {
        return null; // Need activeDays for weekly habits
      }
      
      // Count how many of each active day occur in the date range
      let totalActiveDays = 0
      const currentDate = new Date(startDate)
      
      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
        if (activeDays.includes(dayOfWeek)) {
          totalActiveDays++
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      return totalActiveDays

    case HabitType.MONTHLY:
      // For monthly habits, count months
      const startMonth = startDate.getMonth()
      const startYear = startDate.getFullYear()
      const endMonth = end.getMonth()
      const endYear = end.getFullYear()
      
      const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
      return monthsDiff

    default:
      return null
  }
}
