import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { addHabitToTask, calculateHabitCompletion } from "@/lib/progress-calculator"
import { calculateTargetCount } from "@/lib/habit-helpers"
import { HabitType } from "@/lib/generated/prisma"

// GET /api/habits - Get all habits for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    // Optional filters
    const groupId = searchParams.get("groupId")
    const parentTaskId = searchParams.get("parentTaskId")
    const type = searchParams.get("type")

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
        labels: {
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
      orderBy: {
        createdAt: "desc",
      },
    })

    // Calculate progress for each habit
    const habitsWithProgress = await Promise.all(
      habits.map(async (habit) => {
        const progress = await calculateHabitCompletion(habit.id)
        return {
          ...habit,
          progress,
        }
      })
    )

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

    // Auto-calculate targetCount if not provided
    let targetCount = validatedData.targetCount
    if (!targetCount && validatedData.endDate) {
      const endDate = new Date(validatedData.endDate)
      const calculated = calculateTargetCount(
        validatedData.type,
        endDate,
        validatedData.activeDays || null,
        new Date()
      )
      if (calculated === null) {
        return NextResponse.json(
          { error: "Cannot auto-calculate targetCount. Please provide targetCount or ensure endDate is valid and activeDays is set for WEEKLY habits." },
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
    if (validatedData.parentTaskId) {
      const parentTask = await prisma.task.findFirst({
        where: {
          id: validatedData.parentTaskId,
          userId,
        },
      })

      if (!parentTask) {
        return NextResponse.json(
          { error: "Parent task not found" },
          { status: 404 }
        )
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
      importance: validatedData.importance,
      userId,
      groupId: validatedData.groupId ?? null,
      parentTaskId: validatedData.parentTaskId ?? null,
      endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      activeDays: validatedData.type === "WEEKLY" ? (validatedData.activeDays || []) : [],
    }

    if (validatedData.endDate) {
      habitData.endDate = new Date(validatedData.endDate)
    } else {
      habitData.endDate = null
    }

    // Set activeDays (empty array for non-weekly habits, or provided array for weekly)
    if (validatedData.type === "WEEKLY") {
      habitData.activeDays = validatedData.activeDays || []
    } else {
      habitData.activeDays = []
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
        labels: {
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

    // Add habit to parent task's aggregates if linked to a task
    if (habit.parentTaskId) {
      await addHabitToTask(habit.id)
    }

    return NextResponse.json({ data: habit }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
