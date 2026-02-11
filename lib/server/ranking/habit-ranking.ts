import { calculateIdealProgress, isPending } from "@/lib/date-helpers"

export type HabitRankingCandidate = {
  id: string
  importance: number
  progress?: number | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

type HabitMeta = {
  rank: number
  progress: number
  overdue: boolean
  score: number
  startTime: number
  endTime: number
  updatedTime: number
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function getDateValue(value: Date | string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const date = new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? fallback : time
}

function getHabitScore(habit: HabitRankingCandidate, progress: number): number {
  const startDate = habit.startDate || habit.createdAt || null
  const expectedProgress = calculateIdealProgress(startDate, habit.endDate) ?? 0
  const progressGap = Math.max(0, expectedProgress - progress)
  return progressGap * (habit.importance || 0)
}

function isHabitOverdue(habit: HabitRankingCandidate, progress: number): boolean {
  if (progress >= 100) return false
  if (!habit.endDate) return false
  const endDate = new Date(habit.endDate)
  endDate.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return endDate < today
}

export function createHabitComparator<T extends HabitRankingCandidate>() {
  const habitMeta = new Map<string, HabitMeta>()

  const getMeta = (habit: T): HabitMeta => {
    const cached = habitMeta.get(habit.id)
    if (cached) return cached

    const progress = clampProgress(typeof habit.progress === "number" ? habit.progress : 0)
    const completed = progress >= 100
    const rank = completed ? 2 : (isPending(habit.startDate) ? 1 : 0)
    const overdue = isHabitOverdue(habit, progress)
    const score = getHabitScore(habit, progress)

    const meta: HabitMeta = {
      rank,
      progress,
      overdue,
      score,
      startTime: getDateValue(habit.startDate, Number.POSITIVE_INFINITY),
      endTime: getDateValue(habit.endDate, Number.POSITIVE_INFINITY),
      updatedTime: getDateValue(habit.updatedAt, 0),
    }

    habitMeta.set(habit.id, meta)
    return meta
  }

  return {
    getMeta,
    compare: (a: T, b: T): number => {
      const metaA = getMeta(a)
      const metaB = getMeta(b)

      if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank

      if (metaA.rank === 0) {
        if (metaA.overdue !== metaB.overdue) return metaA.overdue ? -1 : 1
        if (metaA.overdue && metaB.overdue) {
          const endDiff = metaA.endTime - metaB.endTime
          if (endDiff !== 0) return endDiff
        }

        const scoreDiff = metaB.score - metaA.score
        if (scoreDiff !== 0) return scoreDiff

        if (!metaA.overdue && !metaB.overdue) {
          const endDiff = metaA.endTime - metaB.endTime
          if (endDiff !== 0) return endDiff
        }
      } else if (metaA.rank === 1) {
        const startDiff = metaA.startTime - metaB.startTime
        if (startDiff !== 0) return startDiff
      } else {
        const updatedDiff = metaB.updatedTime - metaA.updatedTime
        if (updatedDiff !== 0) return updatedDiff
      }

      return metaB.updatedTime - metaA.updatedTime
    },
  }
}
