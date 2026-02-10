export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { addHabitToTask } from "@/lib/progress-calculator"
import { calculateTargetCount } from "@/lib/habit-helpers"
import { HabitType } from "@prisma/client"
import { calculateIdealProgress, isPending } from "@/lib/date-helpers"
import {
  getInheritedLabelsFromHabit,
} from "@/lib/inheritance-helpers"
import { serializeHabit } from "@/lib/utils"

// GET /api/habits - Get all habits for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const clampProgress = (value: number): number => {
      if (!Number.isFinite(value)) return 0
      return Math.min(100, Math.max(0, value))
    }

    const getDateValue = (value: Date | string | null | undefined, fallback: number): number => {
      if (!value) return fallback
      const date = new Date(value)
      const time = date.getTime()
      return Number.isNaN(time) ? fallback : time
    }

    const getHabitProgress = (habit: any, currentCount: number): number => {
      if (includeLogs && Array.isArray(habit.habitLogs)) {
        const totalCount = habit.habitLogs.reduce((sum: number, log: any) => sum + (log.count || 0), 0)
        if (!habit.targetCount) return 0
        return clampProgress(Math.round((totalCount / habit.targetCount) * 100))
      }
      if (!habit.targetCount) return 0
      return clampProgress(Math.round((currentCount / habit.targetCount) * 100))
    }

    const getHabitScore = (habit: any, progress: number): number => {
      const startDate = habit.startDate || habit.createdAt || null
      const expectedProgress = calculateIdealProgress(startDate, habit.endDate) ?? 0
      const progressGap = Math.max(0, expectedProgress - progress)
      return progressGap * (habit.importance || 0)
    }

    const isHabitOverdue = (habit: any, progress: number): boolean => {
      if (progress >= 100) return false
      if (!habit.endDate) return false
      const endDate = new Date(habit.endDate)
      endDate.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return endDate < today
    }

    // Optional filters
    const groupId = searchParams.get("groupId")
    const parentTaskId = searchParams.get("parentTaskId")
    const type = searchParams.get("type")
    const includeLogs = searchParams.get("includeLogs") === "true" // Defaults to false if not specified
    const status = searchParams.get("status")
    const paginate = searchParams.get("paginate") === "true"
    const limitParam = Number.parseInt(searchParams.get("limit") || "20", 10)
    const cursorParam = Number.parseInt(searchParams.get("cursor") || "0", 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20
    const cursor = Number.isFinite(cursorParam) ? Math.max(cursorParam, 0) : 0
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
    const habitLogSums = habitIds.length > 0
      ? await prisma.habitLog.groupBy({
          by: ["habitId"],
          where: {
            habitId: {
              in: habitIds,
            },
          },
          _sum: {
            count: true,
          },
        })
      : []
    const habitLogCountByHabitId = new Map<string, number>(
      habitLogSums.map((entry) => [entry.habitId, entry._sum.count || 0])
    )

    // Calculate progress for each habit and serialize
    const habitsWithProgress = habits.map((habit) => {
      const currentCount = includeLogs && Array.isArray(habit.habitLogs)
        ? habit.habitLogs.reduce((sum: number, log: any) => sum + (log.count || 0), 0)
        : (habitLogCountByHabitId.get(habit.id) || 0)
      const progress = getHabitProgress(habit, currentCount)
      return serializeHabit({
        ...habit,
        progress,
        currentCount,
      })
    })

    const habitMeta = new Map<string, {
      rank: number
      progress: number
      overdue: boolean
      score: number
      startTime: number
      endTime: number
      updatedTime: number
    }>()

    const getMeta = (habit: any) => {
      const cached = habitMeta.get(habit.id)
      if (cached) return cached
      const progress = typeof habit.progress === "number" ? habit.progress : 0
      const completed = progress >= 100
      const rank = completed ? 2 : (isPending(habit.startDate) ? 1 : 0)
      const overdue = isHabitOverdue(habit, progress)
      const score = getHabitScore(habit, progress)
      const meta = {
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

    const compareHabits = (a: any, b: any) => {
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
    }

    habitsWithProgress.sort(compareHabits)

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
        const pagedHabits = filteredHabits.slice(cursor, cursor + limit)
        const nextCursor = cursor + limit < filteredHabits.length
          ? String(cursor + limit)
          : null
        return NextResponse.json({
          data: pagedHabits,
          pageInfo: {
            nextCursor,
            hasMore: nextCursor !== null,
          },
          statusCounts,
        })
      }

      return NextResponse.json({
        data: filteredHabits,
        statusCounts,
      })
    }

    return NextResponse.json({ data: habitsWithProgress })
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

    // Validate unique title
    await validateUniqueHabitTitle(userId, validatedData.title)

    // Validate activeDays for WEEKLY habits
    if (validatedData.type === "WEEKLY") {
      if (!validatedData.activeDays || validatedData.activeDays.length === 0) {
        return NextResponse.json(
          { error: "activeDays is required for WEEKLY habits" },
          { status: 400 }
        )
      }
      // Validate day numbers are 0-6
      const invalidDays = validatedData.activeDays.filter(day => day < 0 || day > 6)
      if (invalidDays.length > 0) {
        return NextResponse.json(
          { error: "activeDays must contain numbers between 0 (Sunday) and 6 (Saturday)" },
          { status: 400 }
        )
      }
    }

    // Get countPerPeriod (defaults to 1)
    const countPerPeriod = validatedData.countPerPeriod ?? 1

    // Auto-calculate targetCount if not provided
    let targetCount = validatedData.targetCount
    if (!targetCount && validatedData.endDate) {
      const endDate = new Date(validatedData.endDate)
      const calculated = calculateTargetCount(
        validatedData.type,
        endDate,
        validatedData.activeDays || null,
        new Date(),
        countPerPeriod
      )
      if (calculated === null) {
        return NextResponse.json(
          { error: "Cannot auto-calculate targetCount. Please provide targetCount or ensure endDate is valid." },
          { status: 400 }
        )
      }
      targetCount = calculated
    }

    // Ensure targetCount is set
    if (!targetCount || targetCount < 1) {
      return NextResponse.json(
        { error: "targetCount is required and must be positive. Provide it directly or set endDate to auto-calculate." },
        { status: 400 }
      )
    }

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
      type: validatedData.type as "DAILY" | "WEEKLY" | "MONTHLY",
      targetCount: targetCount,
      countPerPeriod: countPerPeriod,
      importance: validatedData.importance,
      userId,
      groupId: validatedData.groupId ?? null,
      parentTaskId: validatedData.parentTaskId ?? null,
      startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
      endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      activeDays: validatedData.type === "WEEKLY" ? (validatedData.activeDays || []) : [],
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
