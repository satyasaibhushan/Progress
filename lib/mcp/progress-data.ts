import { prisma } from "@/lib/prisma"
import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"
import { deriveProgressModel } from "@/lib/progress-model"
import { createHabitComparator } from "@/lib/server/ranking/habit-ranking"
import { createTaskComparator } from "@/lib/server/ranking/task-ranking"
import { toDateOnlyString } from "@/lib/date-only"

export const MCP_ITEM_STATUSES = ["all", "active", "future", "completed"] as const
export const MCP_HABIT_TYPES = ["all", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const

export type McpItemStatus = typeof MCP_ITEM_STATUSES[number]
export type McpHabitType = typeof MCP_HABIT_TYPES[number]

export type McpListOptions = {
  status: McpItemStatus
  search?: string
  limit: number
}

export type McpHabitListOptions = McpListOptions & {
  type: McpHabitType
}

async function loadProgressData(userId: string) {
  const [user, tasks, habits] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        timezone: true,
      },
    }),
    prisma.task.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        importance: true,
        progress: true,
        startDate: true,
        deadline: true,
        parentId: true,
        groupId: true,
        createdAt: true,
        updatedAt: true,
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        taskLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
    }),
    prisma.habit.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        targetCount: true,
        currentCount: true,
        countPerPeriod: true,
        maxCountPerDay: true,
        importance: true,
        startDate: true,
        endDate: true,
        activeDays: true,
        parentTaskId: true,
        groupId: true,
        createdAt: true,
        updatedAt: true,
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        habitLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        habitLogs: {
          select: {
            id: true,
            date: true,
            count: true,
          },
          orderBy: {
            date: "desc",
          },
        },
      },
    }),
  ])

  if (!user) {
    throw new Error("Progress user no longer exists")
  }

  const progressModel = deriveProgressModel(tasks, habits)
  const taskComparator = createTaskComparator<typeof tasks[number] & { progress: number }>()
  const habitComparator = createHabitComparator<typeof habits[number] & { progress: number }>()

  const rankedTasks = tasks
    .map((task) => ({
      ...task,
      progress: progressModel.tasks.get(task.id)?.progress || 0,
    }))
    .sort(taskComparator.compare)
  const rankedHabits = habits
    .map((habit) => ({
      ...habit,
      progress: progressModel.habits.get(habit.id)?.progress || 0,
    }))
    .sort(habitComparator.compare)

  const mappedTasks = rankedTasks.map((task) => {
    const meta = taskComparator.getMeta(task)

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      importance: task.importance,
      progress: task.progress,
      status: meta.rank === 0 ? "active" as const
        : meta.rank === 1 ? "future" as const
          : "completed" as const,
      overdue: meta.overdue,
      startDate: toDateOnlyString(task.startDate),
      deadline: toDateOnlyString(task.deadline),
      parentId: task.parentId,
      group: task.group,
      labels: task.taskLabels.map(({ label }) => label),
      childTaskCount: task._count.children,
      habitCount: task._count.habits,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }
  })

  const mappedHabits = rankedHabits.map((habit) => {
    const derived = progressModel.habits.get(habit.id)
    const period = calculateHabitPeriodMetrics(habit, habit.habitLogs, {
      timeZone: user.timezone,
    })
    const meta = habitComparator.getMeta(habit)

    return {
      id: habit.id,
      title: habit.title,
      description: habit.description,
      type: habit.type,
      targetCount: habit.targetCount,
      currentCount: derived?.currentCount || 0,
      progress: habit.progress,
      status: meta.rank === 0 ? "active" as const
        : meta.rank === 1 ? "future" as const
          : "completed" as const,
      overdue: meta.overdue,
      importance: habit.importance,
      startDate: toDateOnlyString(habit.startDate),
      endDate: toDateOnlyString(habit.endDate),
      activeDays: habit.activeDays,
      parentTaskId: habit.parentTaskId,
      group: habit.group,
      labels: habit.habitLabels.map(({ label }) => label),
      streak: period.streak,
      streakPeriod: period.streakPeriod,
      currentPeriodCount: period.currentPeriodCount,
      currentPeriodTarget: period.currentPeriodTarget,
      currentPeriodComplete: period.currentPeriodComplete,
      weeklyDistinctDays: period.weeklyDistinctDays,
      recentLogs: habit.habitLogs.slice(0, 30).map((log) => ({
        id: log.id,
        date: toDateOnlyString(log.date),
        count: log.count,
      })),
      createdAt: habit.createdAt.toISOString(),
      updatedAt: habit.updatedAt.toISOString(),
    }
  })

  return {
    timezone: user.timezone,
    tasks: mappedTasks,
    habits: mappedHabits,
  }
}

function matchesSearch(
  item: { title: string; description: string | null },
  search?: string,
): boolean {
  const normalized = search?.trim().toLowerCase()
  if (!normalized) return true

  return item.title.toLowerCase().includes(normalized)
    || item.description?.toLowerCase().includes(normalized) === true
}

function getCounts(items: Array<{ status: "active" | "future" | "completed"; overdue: boolean }>) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    future: items.filter((item) => item.status === "future").length,
    completed: items.filter((item) => item.status === "completed").length,
    overdue: items.filter((item) => item.overdue).length,
  }
}

function weightedProgress(
  items: Array<{ progress: number; importance: number }>,
): number {
  const totalWeight = items.reduce(
    (sum, item) => sum + Math.max(0, item.importance),
    0,
  )
  if (totalWeight === 0) return 0

  const total = items.reduce(
    (sum, item) => sum + item.progress * Math.max(0, item.importance),
    0,
  )
  return Math.round((total / totalWeight) * 100) / 100
}

function omitKeys<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const omitted = new Set<string>(keys.map(String))
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  ) as Omit<T, K>
}

export async function getProgressOverview(userId: string) {
  const data = await loadProgressData(userId)
  const rootTasks = data.tasks.filter((task) => task.parentId === null)
  const standaloneHabits = data.habits.filter((habit) => habit.parentTaskId === null)

  return {
    generatedAt: new Date().toISOString(),
    timezone: data.timezone,
    overallProgress: weightedProgress([...rootTasks, ...standaloneHabits]),
    tasks: {
      ...getCounts(data.tasks),
      rootCount: rootTasks.length,
    },
    habits: {
      ...getCounts(data.habits),
      currentPeriodComplete: data.habits.filter(
        (habit) => habit.currentPeriodComplete,
      ).length,
    },
    priorityTasks: rootTasks.slice(0, 10).map(
      (task) => omitKeys(task, "description"),
    ),
    priorityHabits: data.habits.slice(0, 10).map(
      (habit) => omitKeys(habit, "description", "recentLogs"),
    ),
  }
}

export async function listProgressTasks(
  userId: string,
  options: McpListOptions,
) {
  const data = await loadProgressData(userId)
  const filtered = data.tasks.filter((task) => {
    const statusMatches = options.status === "all" || task.status === options.status
    return statusMatches && matchesSearch(task, options.search)
  })

  return {
    generatedAt: new Date().toISOString(),
    timezone: data.timezone,
    totalMatched: filtered.length,
    truncated: filtered.length > options.limit,
    tasks: filtered.slice(0, options.limit),
  }
}

export async function listProgressHabits(
  userId: string,
  options: McpHabitListOptions,
) {
  const data = await loadProgressData(userId)
  const filtered = data.habits.filter((habit) => {
    const statusMatches = options.status === "all" || habit.status === options.status
    const typeMatches = options.type === "all" || habit.type === options.type
    return statusMatches && typeMatches && matchesSearch(habit, options.search)
  })

  return {
    generatedAt: new Date().toISOString(),
    timezone: data.timezone,
    totalMatched: filtered.length,
    truncated: filtered.length > options.limit,
    habits: filtered.slice(0, options.limit).map(
      (habit) => omitKeys(habit, "recentLogs"),
    ),
  }
}

export async function getProgressItem(
  userId: string,
  kind: "task" | "habit",
  id: string,
) {
  const data = await loadProgressData(userId)

  if (kind === "task") {
    const task = data.tasks.find((candidate) => candidate.id === id)
    if (!task) throw new Error("Task not found")
    return {
      generatedAt: new Date().toISOString(),
      timezone: data.timezone,
      kind,
      item: task,
    }
  }

  const habit = data.habits.find((candidate) => candidate.id === id)
  if (!habit) throw new Error("Habit not found")
  return {
    generatedAt: new Date().toISOString(),
    timezone: data.timezone,
    kind,
    item: habit,
  }
}
