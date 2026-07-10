import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"
import {
  calculateHabitProgress,
  sumHabitLogCounts,
} from "@/lib/progress-model"

type HabitLogRow = {
  habitId: string
  date: Date
  count: number
}

type HabitLogClient = {
  habitLog: {
    findMany(args: {
      where: {
        habitId: {
          in: string[]
        }
      }
      select: {
        habitId: true
        date: true
        count: true
      }
    }): Promise<HabitLogRow[]>
  }
}

export type HabitLogMetricInput = {
  id: string
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  countPerPeriod?: number | null
  maxCountPerDay?: number | null
  activeDays?: number[] | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export type HabitProgressInput = {
  id: string
  targetCount: number
  currentCount?: number | null
  progress?: number | null
}

export function mapLogsByHabitId(logs: HabitLogRow[]): Map<string, { date: Date; count: number }[]> {
  const logsByHabitId = new Map<string, { date: Date; count: number }[]>()

  for (const log of logs) {
    const existing = logsByHabitId.get(log.habitId) || []
    existing.push({ date: log.date, count: log.count })
    logsByHabitId.set(log.habitId, existing)
  }

  return logsByHabitId
}

export async function loadLogsByHabitIds(
  prismaLike: HabitLogClient,
  habitIds: string[]
): Promise<Map<string, { date: Date; count: number }[]>> {
  if (habitIds.length === 0) return new Map()

  const uniqueHabitIds = [...new Set(habitIds)]
  const logs = await prismaLike.habitLog.findMany({
    where: {
      habitId: {
        in: uniqueHabitIds,
      },
    },
    select: {
      habitId: true,
      date: true,
      count: true,
    },
  })

  return mapLogsByHabitId(logs)
}

export function attachPeriodMetrics<T extends HabitLogMetricInput>(
  habits: T[],
  logsByHabitId: Map<string, { date: Date; count: number }[]>,
  timeZone: string
): void {
  for (const habit of habits) {
    const periodMetrics = calculateHabitPeriodMetrics(habit, logsByHabitId.get(habit.id) || [], {
      timeZone,
    })
    Object.assign(habit, periodMetrics)
  }
}

export function attachHabitProgress<T extends HabitProgressInput>(
  habits: T[],
  logsByHabitId: Map<string, { date: Date; count: number }[]>
): void {
  for (const habit of habits) {
    const currentCount = sumHabitLogCounts(logsByHabitId.get(habit.id) || [])
    Object.assign(habit, {
      currentCount,
      progress: calculateHabitProgress(currentCount, habit.targetCount),
    })
  }
}
