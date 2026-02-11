import { calculateIdealProgress, isPending } from "@/lib/date-helpers"

export type TaskRankingCandidate = {
  id: string
  importance: number
  progress?: number | null
  total_weight?: bigint | number | string | null
  weighted_progress?: bigint | number | string | null
  startDate?: Date | string | null
  deadline?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  _count?: {
    children?: number
    habits?: number
  }
  children?: unknown[]
  habits?: unknown[]
}

type TaskMeta = {
  rank: number
  progress: number
  overdue: boolean
  score: number
  startTime: number
  deadlineTime: number
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

export function getTaskProgress(task: TaskRankingCandidate): number {
  const hasChildren = typeof task._count?.children === "number"
    ? task._count.children > 0
    : Array.isArray(task.children) && task.children.length > 0
  const hasHabits = typeof task._count?.habits === "number"
    ? task._count.habits > 0
    : Array.isArray(task.habits) && task.habits.length > 0

  if (!hasChildren && !hasHabits) {
    return clampProgress(task.progress || 0)
  }

  if (
    task.total_weight !== null &&
    task.total_weight !== undefined &&
    task.weighted_progress !== null &&
    task.weighted_progress !== undefined
  ) {
    const totalWeight = Number(task.total_weight)
    const weightedProgress = Number(task.weighted_progress)
    if (Number.isFinite(totalWeight) && totalWeight > 0) {
      return clampProgress(weightedProgress / totalWeight)
    }
  }

  return clampProgress(task.progress || 0)
}

function getTaskScore(task: TaskRankingCandidate, progress: number): number {
  const startDate = task.startDate || task.createdAt || null
  const expectedProgress = calculateIdealProgress(startDate, task.deadline) ?? 0
  const progressGap = Math.max(0, expectedProgress - progress)
  return progressGap * (task.importance || 0)
}

function isTaskOverdue(task: TaskRankingCandidate, progress: number): boolean {
  if (progress >= 100) return false
  if (!task.deadline) return false
  const deadline = new Date(task.deadline)
  deadline.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return deadline < today
}

export function createTaskComparator<T extends TaskRankingCandidate>() {
  const taskMeta = new Map<string, TaskMeta>()

  const getMeta = (task: T): TaskMeta => {
    const cached = taskMeta.get(task.id)
    if (cached) return cached

    const progress = getTaskProgress(task)
    const completed = progress >= 100
    const rank = completed ? 2 : (isPending(task.startDate) ? 1 : 0)
    const overdue = isTaskOverdue(task, progress)
    const score = getTaskScore(task, progress)

    const meta: TaskMeta = {
      rank,
      progress,
      overdue,
      score,
      startTime: getDateValue(task.startDate, Number.POSITIVE_INFINITY),
      deadlineTime: getDateValue(task.deadline, Number.POSITIVE_INFINITY),
      updatedTime: getDateValue(task.updatedAt, 0),
    }

    taskMeta.set(task.id, meta)
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
          const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
          if (deadlineDiff !== 0) return deadlineDiff
        }

        const scoreDiff = metaB.score - metaA.score
        if (scoreDiff !== 0) return scoreDiff

        if (!metaA.overdue && !metaB.overdue) {
          const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
          if (deadlineDiff !== 0) return deadlineDiff
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
