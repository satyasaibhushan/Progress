import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"

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

    const completedAt = validatedData.completedAt
      ? new Date(validatedData.completedAt)
      : new Date()

    // For N_PER_DAY habits, check if we should create or update existing log for today
    if (habit.type === "N_PER_DAY") {
      const startOfDay = new Date(completedAt)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(completedAt)
      endOfDay.setHours(23, 59, 59, 999)

      // Check if log exists for this day
      const existingLog = await prisma.habitLog.findFirst({
        where: {
          habitId: id,
          completedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
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

        return NextResponse.json({ data: updatedLog })
      }
    }

    // Create new log
    const log = await prisma.habitLog.create({
      data: {
        habitId: id,
        completedAt,
        count: validatedData.count,
      },
    })

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
      where.completedAt = {}
      if (startDate) {
        where.completedAt.gte = new Date(startDate)
      }
      if (endDate) {
        where.completedAt.lte = new Date(endDate)
      }
    }

    const logs = await prisma.habitLog.findMany({
      where,
      orderBy: {
        completedAt: "desc",
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

    await prisma.habitLog.delete({
      where: {
        id: logId,
      },
    })

    return NextResponse.json({ message: "Log deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
