import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { updateTaskProgressRecursive } from "@/lib/progress-calculator"

// GET /api/habits/[id] - Get a specific habit
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId, // Security: only user's own habits
      },
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
        habitLogs: {
          orderBy: {
            date: "desc",
          },
          take: 30, // Last 30 logs
        },
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    return NextResponse.json({ data: habit })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/habits/[id] - Update a habit
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if habit exists and belongs to user
    const existingHabit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!existingHabit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateHabitSchema.parse(body)

    // Validate unique title (if title is being updated)
    if (validatedData.title) {
      await validateUniqueHabitTitle(userId, validatedData.title, id)
    }

    // Validate targetCount for N_PER_DAY habits
    const finalType = validatedData.type ?? existingHabit.type
    if (finalType === "N_PER_DAY") {
      const finalTarget = validatedData.targetCount ?? existingHabit.targetCount
      if (!finalTarget || finalTarget < 1) {
        return NextResponse.json(
          { error: "targetCount is required for N_PER_DAY habits and must be positive" },
          { status: 400 }
        )
      }
    }

    // If parentTaskId is being updated, verify it exists and belongs to user
    if (validatedData.parentTaskId !== undefined && validatedData.parentTaskId !== null) {
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

    // If groupId is being updated, verify it exists and belongs to user
    if (validatedData.groupId !== undefined && validatedData.groupId !== null) {
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
    const updateData: any = { ...validatedData }
    if (validatedData.endDate) {
      updateData.endDate = new Date(validatedData.endDate)
    }

    const habit = await prisma.habit.update({
      where: {
        id: id,
      },
      data: updateData,
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

    // Recalculate progress if parentTaskId changed
    const parentTaskChanged = validatedData.parentTaskId !== undefined && validatedData.parentTaskId !== existingHabit.parentTaskId

    if (parentTaskChanged) {
      // Update old parent task's progress (if existed)
      if (existingHabit.parentTaskId) {
        await updateTaskProgressRecursive(existingHabit.parentTaskId)
      }
      // Update new parent task's progress (if exists)
      if (habit.parentTaskId) {
        await updateTaskProgressRecursive(habit.parentTaskId)
      }
    }

    return NextResponse.json({ data: habit })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/habits/[id] - Delete a habit
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if habit exists and belongs to user
    const existingHabit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!existingHabit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // Store parent task ID before deletion for progress recalculation
    const parentTaskId = existingHabit.parentTaskId

    // Delete will cascade to habit logs due to schema onDelete: Cascade
    await prisma.habit.delete({
      where: {
        id: id,
      },
    })

    // Recalculate parent task's progress if this habit was linked to a task
    if (parentTaskId) {
      await updateTaskProgressRecursive(parentTaskId)
    }

    return NextResponse.json({ message: "Habit deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
