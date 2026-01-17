import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import {
  calculateHabitCompletionToday,
  updateHabitProgress,
} from "@/lib/progress-calculator"

// POST /api/habits/[id]/log - Log a habit completion
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = logHabitSchema.parse(body)

    const logDate = validatedData.date
      ? new Date(validatedData.date)
      : new Date()

    // Set time to start of day for consistent date comparison
    logDate.setHours(0, 0, 0, 0)

    // Calculate old progress before logging
    const oldProgress = await calculateHabitCompletionToday(id)

    // For N_PER_DAY habits, check if we should create or update existing log for today
    if (habit.type === "N_PER_DAY") {
      // Check if log exists for this day
      const existingLog = await prisma.habitLog.findFirst({
        where: {
          habitId: id,
          date: logDate,
        },
      })

      if (existingLog) {
        // Update existing log count
        const updatedLog = await prisma.habitLog.update({
          where: {
            id: existingLog.id,
          },
          data: {
            count: existingLog.count + validatedData.count,
          },
        })

        // Update parent task aggregates if habit is linked to a task
        if (habit.parentTaskId) {
          const newProgress = await calculateHabitCompletionToday(id)
          await updateHabitProgress(id, oldProgress, newProgress)
        }

        return NextResponse.json({ data: updatedLog })
      }
    }

    // Create new log
    const log = await prisma.habitLog.create({
      data: {
        habitId: id,
        date: logDate,
        count: validatedData.count,
      },
    })

    // Update parent task aggregates if habit is linked to a task
    if (habit.parentTaskId) {
      const newProgress = await calculateHabitCompletionToday(id)
      await updateHabitProgress(id, oldProgress, newProgress)
    }

    return NextResponse.json({ data: log }, { status: 201 })
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

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // Optional date range filters
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where: any = {
      habitId: id,
    }

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
      orderBy: {
        date: "desc",
      },
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

    const body = await request.json()
    const { logId } = body

    if (!logId) {
      return NextResponse.json(
        { error: "logId is required" },
        { status: 400 }
      )
    }

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // Check if log exists and belongs to this habit
    const log = await prisma.habitLog.findFirst({
      where: {
        id: logId,
        habitId: id,
      },
    })

    if (!log) {
      return NextResponse.json({ error: "Log not found" }, { status: 404 })
    }

    // Calculate old progress before deleting log
    const oldProgress = await calculateHabitCompletionToday(id)

    await prisma.habitLog.delete({
      where: {
        id: logId,
      },
    })

    // Update parent task aggregates if habit is linked to a task
    if (habit.parentTaskId) {
      const newProgress = await calculateHabitCompletionToday(id)
      await updateHabitProgress(id, oldProgress, newProgress)
    }

    return NextResponse.json({ message: "Log deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
