export const dynamic = "force-dynamic"

import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { calculateHabitProgressFromCount } from "@/lib/progress-calculator"
import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"
import {
  getDateKeyFromInput,
  getDateKeyInTimeZone,
  getUserTimezone,
} from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import { sumHabitLogCounts } from "@/lib/progress-model"
import { reconcileUserProgress } from "@/lib/server/progress/reconcile"

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getUtcDateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function toUtcDateKey(date: Date | null | undefined): string | null {
  if (!date) return null
  return toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * Log mutations read the existing day's count before writing it.  A
 * serializable transaction prevents two simultaneous clicks from both
 * passing the per-day limit check. PostgreSQL may abort one transaction with
 * a serialization-conflict error; retry a few times so that normal concurrent
 * requests remain successful instead of returning a transient 500.
 */
async function runSerializableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2034" || attempt === 2) {
        throw error
      }
    }
  }

  throw new Error("Transaction failed")
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
    const todayDateKey = getDateKeyInTimeZone(new Date(), userTimeZone)
    const logDateKey = validatedData.date === undefined
      ? todayDateKey
      : getDateKeyFromInput(validatedData.date, userTimeZone)
    if (!logDateKey) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }
    const logDate = getUtcDateFromDateKey(logDateKey)

    if (logDateKey > todayDateKey) {
      return NextResponse.json(
        { error: "Cannot log habit for future dates" },
        { status: 400 }
      )
    }

    const result = await runSerializableTransaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          maxCountPerDay: true,
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

      const oldCountAggregate = await tx.habitLog.aggregate({
        where: { habitId: id },
        _sum: { count: true },
      })
      const oldCurrentCount = oldCountAggregate._sum.count || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)

      const existingLog = await tx.habitLog.findUnique({
        where: {
          habitId_date: {
            habitId: id,
            date: logDate,
          },
        },
      })

      const dayMaxCount = Math.max(1, habit.maxCountPerDay || 1)
      const existingCount = existingLog?.count || 0
      const proposedCount = existingCount + incrementBy
      if (proposedCount > dayMaxCount) {
        return {
          kind: "day_limit_exceeded" as const,
          maxCountPerDay: dayMaxCount,
        }
      }

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

      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const newCurrentCount = sumHabitLogCounts(metricLogs)
      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
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

    if (result.kind === "day_limit_exceeded") {
      return NextResponse.json(
        { error: `Max count per day is ${result.maxCountPerDay}` },
        { status: 400 }
      )
    }

    await reconcileUserProgress(userId)

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
        const parsedStart = parseDateInputToUTCDate(startDate)
        if (!parsedStart) {
          return NextResponse.json({ error: "Invalid startDate" }, { status: 400 })
        }
        where.date.gte = parsedStart
      }
      if (endDate) {
        const parsedEnd = parseDateInputToUTCDate(endDate)
        if (!parsedEnd) {
          return NextResponse.json({ error: "Invalid endDate" }, { status: 400 })
        }
        where.date.lte = parsedEnd
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

    const result = await runSerializableTransaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          maxCountPerDay: true,
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

      const oldCountAggregate = await tx.habitLog.aggregate({
        where: { habitId: id },
        _sum: { count: true },
      })
      const oldCurrentCount = oldCountAggregate._sum.count || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)

      await tx.habitLog.delete({
        where: { id: log.id },
      })

      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const newCurrentCount = sumHabitLogCounts(metricLogs)
      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
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

    await reconcileUserProgress(userId)

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

    const result = await runSerializableTransaction(async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id, userId },
        select: {
          id: true,
          type: true,
          targetCount: true,
          countPerPeriod: true,
          maxCountPerDay: true,
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

      const oldCountAggregate = await tx.habitLog.aggregate({
        where: { habitId: id },
        _sum: { count: true },
      })
      const oldCurrentCount = oldCountAggregate._sum.count || 0
      const oldProgress = calculateHabitProgressFromCount(oldCurrentCount, habit.targetCount || 0)

      let updatedLog = null

      if (count <= 0) {
        await tx.habitLog.delete({
          where: { id: existingLog.id },
        })
      } else {
        const dayMaxCount = Math.max(1, habit.maxCountPerDay || 1)
        if (count > dayMaxCount) {
          return {
            kind: "day_limit_exceeded" as const,
            maxCountPerDay: dayMaxCount,
          }
        }
        updatedLog = await tx.habitLog.update({
          where: { id: existingLog.id },
          data: { count },
        })
      }

      const metricLogs = await tx.habitLog.findMany({
        where: { habitId: id },
        select: {
          date: true,
          count: true,
        },
      })
      const newCurrentCount = sumHabitLogCounts(metricLogs)
      const newProgress = calculateHabitProgressFromCount(newCurrentCount, habit.targetCount || 0)
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

    if (result.kind === "day_limit_exceeded") {
      return NextResponse.json(
        { error: `Max count per day is ${result.maxCountPerDay}` },
        { status: 400 }
      )
    }

    await reconcileUserProgress(userId)

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
