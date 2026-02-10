export const dynamic = "force-dynamic"

import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { calculateHabitProgressFromCount } from "@/lib/progress-calculator"
import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"
import { getUserTimezone } from "@/lib/user-timezone"

type HabitForLogMutation = {
  id: string
  type: "DAILY" | "WEEKLY" | "MONTHLY"
  targetCount: number
  countPerPeriod: number
  activeDays: number[]
  startDate: Date | null
  endDate: Date | null
  currentCount: number
  parentTaskId: string | null
  importance: number
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getDateKeyForTimezoneOffset(timezoneOffsetMinutes?: number): string {
  const now = new Date()
  if (typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)) {
    const localNow = new Date(now.getTime() - timezoneOffsetMinutes * 60 * 1000)
    return toDateKey(localNow.getUTCFullYear(), localNow.getUTCMonth() + 1, localNow.getUTCDate())
  }
  return toDateKey(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
}

function getUtcDateFromInput(dateInput?: string, timezoneOffsetMinutes?: number): Date {
  if (!dateInput) {
    const dateKey = getDateKeyForTimezoneOffset(timezoneOffsetMinutes)
    const [year, month, day] = dateKey.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  if (dateInput) {
    const dateStr = dateInput.split("T")[0]
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
}

function toUtcDateKey(date: Date | null | undefined): string | null {
  if (!date) return null
  return toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

async function propagateTaskAggregatesTx(
  tx: Prisma.TransactionClient,
  taskId: string,
  weightDelta: bigint,
  weightedProgressDelta: bigint
): Promise<void> {
  if (weightDelta === BigInt(0) && weightedProgressDelta === BigInt(0)) {
    return
  }

  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { parentId: true, total_weight: true, weighted_progress: true },
  })

  if (!task) return

  await tx.task.update({
    where: { id: taskId },
    data: {
      total_weight: (task.total_weight || BigInt(0)) + weightDelta,
      weighted_progress: (task.weighted_progress || BigInt(0)) + weightedProgressDelta,
    },
  })

  if (task.parentId) {
    await propagateTaskAggregatesTx(tx, task.parentId, weightDelta, weightedProgressDelta)
  }
}

async function applyHabitProgressDeltaToParentTx(
  tx: Prisma.TransactionClient,
  habit: HabitForLogMutation,
  oldProgress: number,
  newProgress: number
): Promise<void> {
  if (!habit.parentTaskId) return

  const weightedProgressDelta = BigInt(Math.round((newProgress - oldProgress) * habit.importance))
  if (weightedProgressDelta === BigInt(0)) return

  await propagateTaskAggregatesTx(tx, habit.parentTaskId, BigInt(0), weightedProgressDelta)
}

// POST /api/habits/[id]/log - Log a habit completion
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)
    const body = await request.json()
    const validatedData = logHabitSchema.parse(body)
    const incrementBy = validatedData.count || 1
    const logDate = getUtcDateFromInput(validatedData.date, validatedData.timezoneOffsetMinutes)
    const logDateKey = validatedData.date
      ? validatedData.date.split("T")[0]
      : toDateKey(logDate.getUTCFullYear(), logDate.getUTCMonth() + 1, logDate.getUTCDate())
    const todayDateKey = getDateKeyForTimezoneOffset(validatedData.timezoneOffsetMinutes)

    if (logDateKey > todayDateKey) {
      return NextResponse.json(
        { error: "Cannot log habit for future dates" },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          activeDays: true,
          startDate: true,
          endDate: true,
          currentCount: true,
          parentTaskId: true,
          importance: true,
        },
      })

      if (!habit) {
        return { kind: "habit_not_found" as const }
      }

      const startDateKey = toUtcDateKey(habit.startDate)
      if (startDateKey && logDateKey < startDateKey) {
        return {
          kind: "before_start" as const,
          startDateKey,
        }
      }

      const endDateKey = toUtcDateKey(habit.endDate)
      if (endDateKey && logDateKey > endDateKey) {
        return {
          kind: "after_end" as const,
          endDateKey,
        }
      }

      const oldCurrentCount = habit.currentCount || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)

      const existingLog = await tx.habitLog.findUnique({
        where: {
          habitId_date: {
            habitId: id,
            date: logDate,
          },
        },
      })

      const updatedLog = await tx.habitLog.upsert({
        where: {
          habitId_date: {
            habitId: id,
            date: logDate,
          },
        },
        update: {
          count: { increment: incrementBy },
        },
        create: {
          habitId: id,
          date: logDate,
          count: incrementBy,
        },
      })

      const newCurrentCount = oldCurrentCount + incrementBy
      await tx.habit.update({
        where: { id },
        data: { currentCount: newCurrentCount },
      })

      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
      await applyHabitProgressDeltaToParentTx(tx, habit, oldProgress, newProgress)
      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const periodMetrics = calculateHabitPeriodMetrics(habit, metricLogs, { timeZone: userTimeZone })

      return {
        kind: "ok" as const,
        created: !existingLog,
        log: updatedLog,
        oldCurrentCount,
        newCurrentCount,
        oldProgress,
        newProgress,
        periodMetrics,
      }
    })

    if (result.kind === "habit_not_found") {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    if (result.kind === "before_start") {
      return NextResponse.json(
        { error: `Cannot log habit before start date (${result.startDateKey})` },
        { status: 400 }
      )
    }

    if (result.kind === "after_end") {
      return NextResponse.json(
        { error: `Cannot log habit after end date (${result.endDateKey})` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        data: result.log,
        currentCount: result.newCurrentCount,
        progress: result.newProgress,
        ...result.periodMetrics,
      },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/habits/[id]/log - Get habit logs with optional date range
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const habit = await prisma.habit.findFirst({
      where: { id, userId },
      select: { id: true },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where: {
      habitId: string
      date?: {
        gte?: Date
        lte?: Date
      }
    } = { habitId: id }

    if (startDate || endDate) {
      where.date = {}
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        where.date.gte = start
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(0, 0, 0, 0)
        where.date.lte = end
      }
    }

    const logs = await prisma.habitLog.findMany({
      where,
      orderBy: { date: "desc" },
    })

    return NextResponse.json({ data: logs })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/habits/[id]/log - Delete a specific habit log
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)
    const body = await request.json()
    const { logId } = body

    if (!logId) {
      return NextResponse.json(
        { error: "logId is required" },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          activeDays: true,
          startDate: true,
          endDate: true,
          currentCount: true,
          parentTaskId: true,
          importance: true,
        },
      })

      if (!habit) {
        return { kind: "habit_not_found" as const }
      }

      const log = await tx.habitLog.findFirst({
        where: { id: logId, habitId: id },
      })

      if (!log) {
        return { kind: "log_not_found" as const }
      }

      const oldCurrentCount = habit.currentCount || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)
      const newCurrentCount = Math.max(0, oldCurrentCount - log.count)

      await tx.habitLog.delete({
        where: { id: log.id },
      })

      if (newCurrentCount !== oldCurrentCount) {
        await tx.habit.update({
          where: { id },
          data: { currentCount: newCurrentCount },
        })
      }

      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
      await applyHabitProgressDeltaToParentTx(tx, habit, oldProgress, newProgress)
      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const periodMetrics = calculateHabitPeriodMetrics(habit, metricLogs, { timeZone: userTimeZone })

      return {
        kind: "ok" as const,
        oldCurrentCount,
        newCurrentCount,
        oldProgress,
        newProgress,
        periodMetrics,
      }
    })

    if (result.kind === "habit_not_found") {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    if (result.kind === "log_not_found") {
      return NextResponse.json({ error: "Log not found" }, { status: 404 })
    }

    return NextResponse.json({
      message: "Log deleted successfully",
      currentCount: result.newCurrentCount,
      progress: result.newProgress,
      ...result.periodMetrics,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// PATCH /api/habits/[id]/log - Update habit log count
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)
    const body = await request.json()
    const { logId, count } = body

    if (!logId || count === undefined) {
      return NextResponse.json(
        { error: "logId and count are required" },
        { status: 400 }
      )
    }

    if (!Number.isFinite(count) || !Number.isInteger(count)) {
      return NextResponse.json(
        { error: "count must be an integer" },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          activeDays: true,
          startDate: true,
          endDate: true,
          currentCount: true,
          parentTaskId: true,
          importance: true,
        },
      })

      if (!habit) {
        return { kind: "habit_not_found" as const }
      }

      const existingLog = await tx.habitLog.findFirst({
        where: { id: logId, habitId: id },
      })

      if (!existingLog) {
        return { kind: "log_not_found" as const }
      }

      const oldCurrentCount = habit.currentCount || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)

      let newCurrentCount = oldCurrentCount
      let updatedLog = null

      if (count <= 0) {
        newCurrentCount = Math.max(0, oldCurrentCount - existingLog.count)
        await tx.habitLog.delete({
          where: { id: existingLog.id },
        })
      } else {
        const deltaCount = count - existingLog.count
        newCurrentCount = Math.max(0, oldCurrentCount + deltaCount)
        updatedLog = await tx.habitLog.update({
          where: { id: existingLog.id },
          data: { count },
        })
      }

      if (newCurrentCount !== oldCurrentCount) {
        await tx.habit.update({
          where: { id },
          data: { currentCount: newCurrentCount },
        })
      }

      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
      await applyHabitProgressDeltaToParentTx(tx, habit, oldProgress, newProgress)
      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const periodMetrics = calculateHabitPeriodMetrics(habit, metricLogs, { timeZone: userTimeZone })

      return {
        kind: "ok" as const,
        updatedLog,
        oldCurrentCount,
        newCurrentCount,
        oldProgress,
        newProgress,
        periodMetrics,
      }
    })

    if (result.kind === "habit_not_found") {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    if (result.kind === "log_not_found") {
      return NextResponse.json({ error: "Log not found" }, { status: 404 })
    }

    return NextResponse.json({
      message: "Log updated successfully",
      data: result.updatedLog,
      currentCount: result.newCurrentCount,
      progress: result.newProgress,
      ...result.periodMetrics,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
