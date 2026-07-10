export type HabitLogCount = {
  count: number
}

export type ProgressTask = {
  id: string
  parentId: string | null
  importance: number
  progress: number | null
}

export type ProgressHabit = {
  id: string
  parentTaskId: string | null
  importance: number
  targetCount: number
  currentCount?: number | null
  habitLogs?: HabitLogCount[]
}

export type HabitProgress = {
  currentCount: number
  progress: number
}

export type TaskProgress = {
  isLeaf: boolean
  progress: number
  totalWeight: number
  weightedProgress: number
}

export type ProgressModel = {
  habits: Map<string, HabitProgress>
  tasks: Map<string, TaskProgress>
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return roundToTwoDecimals(Math.min(100, Math.max(0, value)))
}

export function sumHabitLogCounts(logs: HabitLogCount[]): number {
  return logs.reduce((sum, log) => {
    return sum + (Number.isFinite(log.count) ? log.count : 0)
  }, 0)
}

export function calculateHabitProgress(currentCount: number, targetCount: number): number {
  if (!Number.isFinite(targetCount) || targetCount <= 0) return 0
  return clampProgress((currentCount / targetCount) * 100)
}

export function deriveProgressModel(
  tasks: ProgressTask[],
  habits: ProgressHabit[]
): ProgressModel {
  const habitProgress = new Map<string, HabitProgress>()
  const habitsByParentTaskId = new Map<string, ProgressHabit[]>()

  for (const habit of habits) {
    const currentCount = habit.habitLogs
      ? sumHabitLogCounts(habit.habitLogs)
      : Math.max(0, habit.currentCount || 0)
    habitProgress.set(habit.id, {
      currentCount,
      progress: calculateHabitProgress(currentCount, habit.targetCount),
    })

    if (habit.parentTaskId) {
      const linkedHabits = habitsByParentTaskId.get(habit.parentTaskId) || []
      linkedHabits.push(habit)
      habitsByParentTaskId.set(habit.parentTaskId, linkedHabits)
    }
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const childrenByParentId = new Map<string, ProgressTask[]>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const children = childrenByParentId.get(task.parentId) || []
    children.push(task)
    childrenByParentId.set(task.parentId, children)
  }

  const taskProgress = new Map<string, TaskProgress>()
  const visiting = new Set<string>()

  const deriveTask = (task: ProgressTask): TaskProgress => {
    const cached = taskProgress.get(task.id)
    if (cached) return cached
    if (visiting.has(task.id)) {
      throw new Error(`Task hierarchy contains a cycle at ${task.id}`)
    }

    visiting.add(task.id)
    const children = childrenByParentId.get(task.id) || []
    const linkedHabits = habitsByParentTaskId.get(task.id) || []
    const isLeaf = children.length === 0 && linkedHabits.length === 0

    let totalWeight = 0
    let weightedProgress = 0
    let progress = clampProgress(task.progress || 0)

    if (isLeaf) {
      totalWeight = Math.max(0, task.importance || 0)
      weightedProgress = Math.round(progress * totalWeight)
    } else {
      for (const child of children) {
        const childProgress = deriveTask(child)
        totalWeight += childProgress.totalWeight
        weightedProgress += childProgress.weightedProgress
      }

      for (const habit of linkedHabits) {
        const linkedHabitProgress = habitProgress.get(habit.id)
        const weight = Math.max(0, habit.importance || 0)
        totalWeight += weight
        weightedProgress += Math.round((linkedHabitProgress?.progress || 0) * weight)
      }

      progress = totalWeight > 0
        ? clampProgress(weightedProgress / totalWeight)
        : 0
    }

    const result = {
      isLeaf,
      progress,
      totalWeight,
      weightedProgress,
    }
    visiting.delete(task.id)
    taskProgress.set(task.id, result)
    return result
  }

  for (const task of taskById.values()) {
    deriveTask(task)
  }

  return {
    habits: habitProgress,
    tasks: taskProgress,
  }
}
