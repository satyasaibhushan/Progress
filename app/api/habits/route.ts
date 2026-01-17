import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { addHabitToTask } from "@/lib/progress-calculator"

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
    const where: any = { userId }

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
      where.type = type
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

    return NextResponse.json({ data: habits })
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

    // Validate targetCount is provided for N_PER_DAY habits
    if (validatedData.type === "N_PER_DAY") {
      if (!validatedData.targetCount || validatedData.targetCount < 1) {
        return NextResponse.json(
          { error: "targetCount is required for N_PER_DAY habits and must be positive" },
          { status: 400 }
        )
      }
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

    // Convert endDate string to Date if provided
    const habitData: any = {
      ...validatedData,
      userId,
    }

    if (validatedData.endDate) {
      habitData.endDate = new Date(validatedData.endDate)
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
