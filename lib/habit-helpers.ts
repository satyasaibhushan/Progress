import { HabitType } from "./generated/prisma"

/**
 * Calculate targetCount from endDate if not provided
 *
 * @param type - Habit type (DAILY, WEEKLY, MONTHLY)
 * @param endDate - End date of the habit
 * @param activeDays - Active days for WEEKLY habits (0=Sun, 1=Mon, ..., 6=Sat) - used as constraint, not for calculation
 * @param createdAt - When the habit was created (defaults to now)
 * @param countPerPeriod - How many times per day/week/month (defaults to 1)
 * @returns Calculated targetCount or null if cannot be calculated
 */
export function calculateTargetCount(
  type: HabitType,
  endDate: Date | null | undefined,
  activeDays: number[] | null | undefined = null,
  createdAt: Date = new Date(),
  countPerPeriod: number = 1
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
      // For daily habits: days × countPerPeriod
      return diffDays * countPerPeriod

    case HabitType.WEEKLY:
      // For weekly habits: weeks × countPerPeriod
      // activeDays is used as a constraint/reminder in UI, not for calculation
      const weeks = Math.ceil(diffDays / 7)
      return weeks * countPerPeriod

    case HabitType.MONTHLY:
      // For monthly habits: months × countPerPeriod
      const startMonth = startDate.getMonth()
      const startYear = startDate.getFullYear()
      const endMonth = end.getMonth()
      const endYear = end.getFullYear()

      const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
      return monthsDiff * countPerPeriod

    default:
      return null
  }
}
