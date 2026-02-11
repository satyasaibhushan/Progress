export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { addHabitToTask } from "@/lib/progress-calculator"
import { HabitType } from "@prisma/client"
import { getUserTimezone } from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import {
  getInheritedLabelsFromHabit,
} from "@/lib/inheritance-helpers"
import { serializeHabit } from "@/lib/utils"
import { normalizeCursorPagination, getPaginatedWindow } from "@/lib/server/pagination/cursor"
import { createHabitComparator } from "@/lib/server/ranking/habit-ranking"
import { attachPeriodMetrics, loadLogsByHabitIds } from "@/lib/server/habits/log-metrics"

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

type HabitWithOptionalLogs = {
  id: string
  targetCount: number
  currentCount: number | null
  habitLogs?: Array<{ date: Date; count: number }>
}

function normalizeActiveDays(activeDays: number[] | null | undefined): number[] {
  const normalized = (activeDays || [])
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)

  return Array.from(new Set(normalized))
}

// GET /api/habits - Get all habits for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)
    const userTimeZone = await getUserTimezone(userId)

    const clampProgress = (value: number): number => {
      if (!Number.isFinite(value)) return 0
      return Math.min(100, Math.max(0, value))
    }

    const getHabitProgress = (habit: HabitWithOptionalLogs, currentCount: number): number => {
      if (!habit.targetCount) return 0
      return clampProgress(Math.round((currentCount / habit.targetCount) * 100))
    }

    // Optional filters
    const groupId = searchParams.get("groupId")
    const parentTaskId = searchParams.get("parentTaskId")
    const type = searchParams.get("type")
    const includeLogs = searchParams.get("includeLogs") === "true" // Defaults to false if not specified
    const status = searchParams.get("status")
    const paginate = searchParams.get("paginate") === "true"
    const highlightId = searchParams.get("highlightId")
    const { limit, cursor } = normalizeCursorPagination({
      limitParam: searchParams.get("limit"),
      cursorParam: searchParams.get("cursor"),
    })
    const statusFilter = status === "active" || status === "future" || status === "completed"
      ? status
      : null

    // Build where clause
    const where: {
      userId: string
      groupId?: string
      parentTaskId?: string | null
      type?: HabitType
    } = { userId }

    if (groupId) {
      where.groupId = groupId
    }

    if (parentTaskId !== null) {
      if (parentTaskId === "null") {
        where.parentTaskId = null
      } else {
        where.parentTaskId = parentTaskId
      }
    }

    if (type) {
      where.type = type as HabitType
    }

    const habits = await prisma.habit.findMany({
      where,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        },
        habitLabels: {
          include: {
            label: true,
          },
        },
        habitLogs: includeLogs ? {
          orderBy: {
            date: "desc",
          },
        } : false,
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const habitIds = habits.map((habit) => habit.id)
    const logsByHabitId = new Map<string, { date: Date; count: number }[]>()

    if (includeLogs) {
      for (const habit of habits) {
        const logs = Array.isArray(habit.habitLogs)
          ? habit.habitLogs.map((log) => ({ date: log.date, count: log.count }))
          : []
        logsByHabitId.set(habit.id, logs)
      }
    } else if (habitIds.length > 0) {
      const loadedLogs = await loadLogsByHabitIds(prisma, habitIds)
      for (const [habitId, logs] of loadedLogs.entries()) {
        logsByHabitId.set(habitId, logs)
      }
    }

    attachPeriodMetrics(habits, logsByHabitId, userTimeZone)

    // Calculate progress for each habit
    const habitsWithProgress = habits.map((habit) => {
      const currentCount = includeLogs && Array.isArray(habit.habitLogs)
        ? habit.habitLogs.reduce((sum, log) => sum + (log.count || 0), 0)
        : (habit.currentCount || 0)
      const progress = getHabitProgress(habit, currentCount)
      return {
        ...habit,
        progress,
        currentCount,
      }
    })

    type HabitWithProgress = typeof habitsWithProgress[number]
    const { compare, getMeta } = createHabitComparator<HabitWithProgress>()
    habitsWithProgress.sort(compare)

    if (paginate || statusFilter) {
      const statusCounts = {
        active: 0,
        future: 0,
        completed: 0,
      }

      for (const habit of habitsWithProgress) {
        const rank = getMeta(habit).rank
        if (rank === 0) statusCounts.active += 1
        else if (rank === 1) statusCounts.future += 1
        else statusCounts.completed += 1
      }

      const filteredHabits = statusFilter
        ? habitsWithProgress.filter((habit) => {
            const rank = getMeta(habit).rank
            if (statusFilter === "active") return rank === 0
            if (statusFilter === "future") return rank === 1
            return rank === 2
          })
        : habitsWithProgress

      if (paginate) {
        let highlightIndex = -1
        if (highlightId) {
          highlightIndex = filteredHabits.findIndex((habit) => habit.id === highlightId)
        }

        const page = getPaginatedWindow(filteredHabits, limit, cursor, {
          highlightIndex,
        })

        return NextResponse.json({
          data: page.pageItems.map((habit) => serializeHabit(habit)),
          pageInfo: {
            nextCursor: page.nextCursor,
            hasMore: page.nextCursor !== null,
          },
          statusCounts,
        })
      }

      return NextResponse.json({
        data: filteredHabits.map((habit) => serializeHabit(habit)),
        statusCounts,
      })
    }

    return NextResponse.json({ data: habitsWithProgress.map((habit) => serializeHabit(habit)) })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/habits - Create a new habit
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createHabitSchema.parse(body)
    const parsedStartDate = parseDateInputToUTCDate(validatedData.startDate)
    const parsedEndDate = parseDateInputToUTCDate(validatedData.endDate)

    if (validatedData.startDate && !parsedStartDate) {
      return NextResponse.json(
        { error: "Invalid startDate" },
        { status: 400 }
      )
    }

    if (validatedData.endDate && !parsedEndDate) {
      return NextResponse.json(
        { error: "Invalid endDate" },
        { status: 400 }
      )
    }

    // Validate unique title
    await validateUniqueHabitTitle(userId, validatedData.title)

    const isDaily = validatedData.type === "DAILY"
    const countPerPeriod = isDaily ? 1 : (validatedData.countPerPeriod ?? 1)
    const maxCountPerDay = validatedData.maxCountPerDay ?? 1
    const activeDays = isDaily
      ? (() => {
          const normalized = normalizeActiveDays(validatedData.activeDays)
          return normalized.length > 0 ? normalized : [...ALL_DAYS]
        })()
      : []

    // If parentTaskId is provided, verify it exists and belongs to user
    let parentTask = null
    if (validatedData.parentTaskId) {
      parentTask = await prisma.task.findFirst({
        where: {
          id: validatedData.parentTaskId,
          userId,
        },
        include: {
          taskLabels: {
            select: { labelId: true },
          },
        },
      })

      if (!parentTask) {
        return NextResponse.json(
          { error: "Parent task not found" },
          { status: 404 }
        )
      }

      // Inherit group from parent if not explicitly set
      if (!validatedData.groupId && parentTask.groupId) {
        validatedData.groupId = parentTask.groupId
      }
    }

    // If groupId is provided, verify it exists and belongs to user
    if (validatedData.groupId) {
      const group = await prisma.group.findFirst({
        where: {
          id: validatedData.groupId,
          userId,
        },
      })

      if (!group) {
        return NextResponse.json(
          { error: "Group not found" },
          { status: 404 }
        )
      }
    }

    // Prepare habit data
    const habitData = {
      title: validatedData.title,
      description: validatedData.description ?? null,
      type: validatedData.type as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
      targetCount: validatedData.targetCount,
      countPerPeriod: countPerPeriod,
      maxCountPerDay,
      importance: validatedData.importance,
      userId,
      groupId: validatedData.groupId ?? null,
      parentTaskId: validatedData.parentTaskId ?? null,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      activeDays,
    }

    const habit = await prisma.habit.create({
      data: habitData,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        },
        habitLabels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
    })

    // Add labels from labelIds if provided
    if (validatedData.labelIds && validatedData.labelIds.length > 0) {
      for (const labelId of validatedData.labelIds) {
        // Verify label belongs to user
        const label = await prisma.label.findFirst({
          where: { id: labelId, userId },
        })
        if (label) {
          await prisma.habitLabel.create({
            data: {
              habitId: habit.id,
              labelId,
            },
          }).catch(() => {
            // Ignore if already exists
          })
        }
      }
    }

    // If habit has a parent task, inherit labels from parent
    if (habit.parentTaskId && parentTask) {
      const parentLabelIds = parentTask.taskLabels.map((tl) => tl.labelId)
      // Also get inherited labels from parent's ancestors
      const inheritedLabels = await getInheritedLabelsFromHabit(habit.id, userId)
      const allInheritedLabels = [...new Set([...inheritedLabels, ...parentLabelIds])]
      
      // Add inherited labels to the new habit (avoid duplicates)
      for (const labelId of allInheritedLabels) {
        await prisma.habitLabel.create({
          data: {
            habitId: habit.id,
            labelId,
          },
        }).catch(() => {
          // Ignore if label already exists
        })
      }
    }

    // Add habit to parent task's aggregates if linked to a task
    if (habit.parentTaskId) {
      await addHabitToTask(habit.id)
    }

    // Reload habit with updated labels
    const updatedHabit = await prisma.habit.findUnique({
      where: { id: habit.id },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        },
        habitLabels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
    })

    return NextResponse.json({ data: serializeHabit(updatedHabit!) }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
