import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import { addHabitToTask, removeHabitFromTask, calculateHabitCompletion } from "@/lib/progress-calculator"
import { calculateTargetCount } from "@/lib/habit-helpers"

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

    // Calculate progress on-demand
    const progress = await calculateHabitCompletion(habit.id)

    return NextResponse.json({
      data: {
        ...habit,
        progress,
      },
    })
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

    // Validate activeDays for WEEKLY habits
    const finalType = validatedData.type ?? existingHabit.type
    const finalActiveDays = validatedData.activeDays ?? existingHabit.activeDays
    
    if (finalType === "WEEKLY") {
      if (!finalActiveDays || finalActiveDays.length === 0) {
        return NextResponse.json(
          { error: "activeDays is required for WEEKLY habits" },
          { status: 400 }
        )
      }
      // Validate day numbers are 0-6
      const invalidDays = finalActiveDays.filter((day: number) => day < 0 || day > 6)
      if (invalidDays.length > 0) {
        return NextResponse.json(
          { error: "activeDays must contain numbers between 0 (Sunday) and 6 (Saturday)" },
          { status: 400 }
        )
      }
    }

    // Auto-calculate targetCount if not provided but endDate is set/changed
    let targetCount = validatedData.targetCount ?? existingHabit.targetCount
    const finalEndDate = validatedData.endDate !== undefined 
      ? (validatedData.endDate ? new Date(validatedData.endDate) : null)
      : existingHabit.endDate
    
    if (!targetCount && finalEndDate) {
      const calculated = calculateTargetCount(
        finalType,
        finalEndDate,
        finalActiveDays,
        existingHabit.createdAt
      )
      if (calculated !== null) {
        targetCount = calculated
      }
    }

    // Ensure targetCount is set
    if (!targetCount || targetCount < 1) {
      return NextResponse.json(
        { error: "targetCount is required and must be positive. Provide it directly or set endDate to auto-calculate." },
        { status: 400 }
      )
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

    // Prepare update data
    const updateData: {
      title?: string
      description?: string | null
      type?: string
      targetCount?: number
      importance?: number
      endDate?: Date | null
      activeDays?: number[]
      groupId?: string | null
      parentTaskId?: string | null
    } = {}

    if (validatedData.title !== undefined) updateData.title = validatedData.title
    if (validatedData.description !== undefined) updateData.description = validatedData.description ?? null
    if (validatedData.type !== undefined) updateData.type = validatedData.type
    if (validatedData.importance !== undefined) updateData.importance = validatedData.importance
    if (validatedData.groupId !== undefined) updateData.groupId = validatedData.groupId ?? null
    if (validatedData.parentTaskId !== undefined) updateData.parentTaskId = validatedData.parentTaskId ?? null
    
    // Set targetCount (use calculated if auto-calculated, otherwise use provided or existing)
    if (targetCount !== existingHabit.targetCount) {
      updateData.targetCount = targetCount
    }
    
    // Set endDate
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null
    }
    
    // Set activeDays
    if (validatedData.activeDays !== undefined) {
      if (finalType === "WEEKLY") {
        updateData.activeDays = validatedData.activeDays || []
      } else {
        updateData.activeDays = []
      }
    } else if (validatedData.type !== undefined && validatedData.type !== "WEEKLY") {
      // If type changed from WEEKLY to something else, clear activeDays
      updateData.activeDays = []
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

    // Update aggregates if parentTaskId changed
    const parentTaskChanged = validatedData.parentTaskId !== undefined && validatedData.parentTaskId !== existingHabit.parentTaskId

    if (parentTaskChanged) {
      // Remove from old parent task (if existed)
      if (existingHabit.parentTaskId) {
        await removeHabitFromTask(
          existingHabit.id,
          existingHabit.parentTaskId,
          existingHabit.importance
        )
      }
      // Add to new parent task (if exists)
      if (habit.parentTaskId) {
        await addHabitToTask(habit.id)
      }
    }

    // Calculate progress on-demand
    const progress = await calculateHabitCompletion(habit.id)

    return NextResponse.json({
      data: {
        ...habit,
        progress,
      },
    })
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

    // Store parent task ID and importance before deletion
    const parentTaskId = existingHabit.parentTaskId
    const importance = existingHabit.importance

    // Delete will cascade to habit logs due to schema onDelete: Cascade
    await prisma.habit.delete({
      where: {
        id: id,
      },
    })

    // Remove from parent task's aggregates if this habit was linked to a task
    if (parentTaskId) {
      await removeHabitFromTask(id, parentTaskId, importance)
    }

    return NextResponse.json({ message: "Habit deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
