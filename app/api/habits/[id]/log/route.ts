import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import {
  calculateHabitCompletion,
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

    let logDate: Date
    if (validatedData.date) {
      // Parse the date string and create a date at midnight UTC
      // This ensures consistent date comparison regardless of timezone
      const dateStr = validatedData.date.split('T')[0] // Get YYYY-MM-DD part
      const [year, month, day] = dateStr.split('-').map(Number)
      // Create date at midnight UTC to avoid timezone shifts
      // This ensures the date stored matches what the user selected
      logDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
    } else {
      // Use today's date at midnight UTC
      const now = new Date()
      logDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    }

    // Validate that the log date is not in the future
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    if (logDate > today) {
      return NextResponse.json(
        { error: "Cannot log habit for future dates" },
        { status: 400 }
      )
    }

    // Calculate old progress before logging
    const oldProgress = await calculateHabitCompletion(id)

    // For all habits, check if we should create or update existing log for the date
    // Since date is stored as @db.Date, we can compare directly
    // The unique constraint [habitId, date] ensures one log per day
    // Use findFirst with the unique fields since Prisma generates the constraint name
    const existingLog = await prisma.habitLog.findFirst({
      where: {
        habitId: id,
        date: logDate,
      },
    })

    if (existingLog) {
      // Update existing log count (increment)
      const updatedLog = await prisma.habitLog.update({
        where: {
          id: existingLog.id,
        },
        data: {
          count: existingLog.count + (validatedData.count || 1),
        },
      })

      // Update parent task aggregates if habit is linked to a task
      if (habit.parentTaskId) {
        const newProgress = await calculateHabitCompletion(id)
        await updateHabitProgress(id, oldProgress, newProgress)
      }

      return NextResponse.json({ data: updatedLog })
    }

    // Create new log
    // Handle potential race condition with try-catch
    let log
    try {
      log = await prisma.habitLog.create({
        data: {
          habitId: id,
          date: logDate,
          count: validatedData.count || 1,
        },
      })
    } catch (error: any) {
      // If unique constraint violation (race condition), fetch and update existing log
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        const existingLog = await prisma.habitLog.findFirst({
          where: {
            habitId: id,
            date: logDate,
          },
        })
        if (existingLog) {
          log = await prisma.habitLog.update({
            where: {
              id: existingLog.id,
            },
            data: {
              count: existingLog.count + (validatedData.count || 1),
            },
          })
        } else {
          throw error
        }
      } else {
        throw error
      }
    }

    // Update parent task aggregates if habit is linked to a task
    if (habit.parentTaskId) {
      const newProgress = await calculateHabitCompletion(id)
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

    const where: {
      habitId: string
      date?: {
        gte?: Date
        lte?: Date
      }
    } = {
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
    const oldProgress = await calculateHabitCompletion(id)

    await prisma.habitLog.delete({
      where: {
        id: logId,
      },
    })

    // Update parent task aggregates if habit is linked to a task
    if (habit.parentTaskId) {
      const newProgress = await calculateHabitCompletion(id)
      await updateHabitProgress(id, oldProgress, newProgress)
    }

    return NextResponse.json({ message: "Log deleted successfully" })
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

    const body = await request.json()
    const { logId, count } = body

    if (!logId || count === undefined) {
      return NextResponse.json(
        { error: "logId and count are required" },
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
    const existingLog = await prisma.habitLog.findFirst({
      where: {
        id: logId,
        habitId: id,
      },
    })

    if (!existingLog) {
      return NextResponse.json({ error: "Log not found" }, { status: 404 })
    }

    // Calculate old progress before updating
    const oldProgress = await calculateHabitCompletion(id)

    // If count is 0 or less, delete the log
    if (count <= 0) {
      await prisma.habitLog.delete({
        where: {
          id: logId,
        },
      })
    } else {
      // Update the log count
      await prisma.habitLog.update({
        where: {
          id: logId,
        },
        data: {
          count: count,
        },
      })
    }

    // Update parent task aggregates if habit is linked to a task
    if (habit.parentTaskId) {
      const newProgress = await calculateHabitCompletion(id)
      await updateHabitProgress(id, oldProgress, newProgress)
    }

    return NextResponse.json({ message: "Log updated successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
