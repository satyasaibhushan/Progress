import { HabitType } from "@prisma/client"

/**
 * Calculate targetCount from endDate if not provided
 *
 * @param type - Habit type (DAILY, WEEKLY, MONTHLY)
 * @param endDate - End date of the habit
 * @param activeDays - Active days for WEEKLY habits (kept for API compatibility, not used in calculation)
 * @param startDate - Start date anchor for the habit lifecycle
 * @param countPerPeriod - How many times per day/week/month (defaults to 1)
 * @returns Calculated targetCount or null if cannot be calculated
 */
export function calculateTargetCount(
  type: HabitType,
  endDate: Date | null | undefined,
  activeDays: number[] | null | undefined = null,
  startDate: Date | null | undefined,
  countPerPeriod: number = 1
): number | null {
  void activeDays

  if (!endDate) {
    return null
  }

  if (!startDate) {
    return null
  }

  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) return null
  end.setUTCHours(0, 0, 0, 0)

  if (end.getTime() < start.getTime()) {
    return null
  }

  const normalizedCountPerPeriod = Math.max(1, Math.floor(countPerPeriod || 1))
  const diffDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

  switch (type) {
    case HabitType.DAILY:
      return diffDays * normalizedCountPerPeriod

    case HabitType.WEEKLY:
      {
        const startOfWeek = new Date(start)
        startOfWeek.setUTCDate(start.getUTCDate() - start.getUTCDay())

        const endOfWeek = new Date(end)
        endOfWeek.setUTCDate(end.getUTCDate() - end.getUTCDay())

        const weeks = Math.floor((endOfWeek.getTime() - startOfWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
        return weeks * normalizedCountPerPeriod
      }

    case HabitType.MONTHLY:
      {
      const startMonth = start.getUTCMonth()
      const startYear = start.getUTCFullYear()
      const endMonth = end.getUTCMonth()
      const endYear = end.getUTCFullYear()

      const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
      return monthsDiff * normalizedCountPerPeriod
      }

    default:
      return null
  }
}
