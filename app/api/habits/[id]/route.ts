export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import {
  addHabitToTask,
  removeHabitFromTask,
  calculateHabitCompletion,
  updateHabitContribution,
} from "@/lib/progress-calculator"
import { calculateTargetCount } from "@/lib/habit-helpers"
import {
  getInheritedLabelsFromHabit,
  getInheritedGroupFromHabit,
  canChangeHabitGroup,
} from "@/lib/inheritance-helpers"
import { serializeHabit } from "@/lib/utils"

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
        habitLabels: {
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
      data: serializeHabit({
        ...habit,
        progress,
      }),
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

    const oldHabitProgress = existingHabit.parentTaskId
      ? await calculateHabitCompletion(id)
      : null

    const body = await request.json()
    const validatedData = updateHabitSchema.parse(body)
    
    // Extract labelIds from validated data
    const { labelIds, ...updateFields } = validatedData

    // Validate unique title (if title is being updated)
    if (updateFields.title) {
      await validateUniqueHabitTitle(userId, updateFields.title, id)
    }

    // Validate activeDays for WEEKLY habits
    const finalType = updateFields.type ?? existingHabit.type
    const finalActiveDays = updateFields.activeDays ?? existingHabit.activeDays
    
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

    // Get countPerPeriod (use provided value, existing value, or default to 1)
    const finalCountPerPeriod = validatedData.countPerPeriod ?? existingHabit.countPerPeriod ?? 1

    // Auto-calculate targetCount if not provided but endDate is set/changed
    let targetCount = validatedData.targetCount ?? existingHabit.targetCount
    const finalEndDate = validatedData.endDate !== undefined
      ? (validatedData.endDate ? new Date(validatedData.endDate) : null)
      : existingHabit.endDate

    // Recalculate targetCount if countPerPeriod changed or targetCount is not set
    const countPerPeriodChanged = validatedData.countPerPeriod !== undefined &&
      validatedData.countPerPeriod !== existingHabit.countPerPeriod

    if ((!targetCount || countPerPeriodChanged) && finalEndDate) {
      const calculated = calculateTargetCount(
        finalType,
        finalEndDate,
        finalActiveDays,
        existingHabit.createdAt,
        finalCountPerPeriod
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
    let newParentTask = null
    const parentTaskChanged = updateFields.parentTaskId !== undefined && updateFields.parentTaskId !== existingHabit.parentTaskId
    
    if (updateFields.parentTaskId !== undefined && updateFields.parentTaskId !== null) {
      newParentTask = await prisma.task.findFirst({
        where: {
          id: updateFields.parentTaskId,
          userId,
        },
        include: {
          taskLabels: {
            select: { labelId: true },
          },
        },
      })

      if (!newParentTask) {
        return NextResponse.json(
          { error: "Parent task not found" },
          { status: 404 }
        )
      }

      // Inherit group from parent if not explicitly set
      if (!updateFields.groupId && newParentTask.groupId) {
        updateFields.groupId = newParentTask.groupId
      }
    }

    // If groupId is being updated, verify it exists and belongs to user
    if (updateFields.groupId !== undefined && updateFields.groupId !== null) {
      const group = await prisma.group.findFirst({
        where: {
          id: updateFields.groupId,
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

    // Check if group can be changed (not inherited from parent)
    // Only check if groupId is actually being changed (not just present in the request)
    const groupChanged = updateFields.groupId !== undefined && 
      updateFields.groupId !== existingHabit.groupId
    if (groupChanged && !parentTaskChanged) {
      const canChange = await canChangeHabitGroup(id, userId)
      if (!canChange) {
        const inheritedGroup = await getInheritedGroupFromHabit(id, userId)
        return NextResponse.json(
          { 
            error: "Cannot change group. This habit inherits its group from a parent task. Unlink it from the parent task to change the group.",
            inheritedGroupId: inheritedGroup,
          },
          { status: 400 }
        )
      }
    }

    // Prepare update data - use Record type to allow dynamic property assignment
    const updateData: Record<string, unknown> = {}

    if (updateFields.title !== undefined) updateData.title = updateFields.title
    if (updateFields.description !== undefined) updateData.description = updateFields.description ?? null
    if (updateFields.type !== undefined) updateData.type = updateFields.type
    if (updateFields.importance !== undefined) updateData.importance = updateFields.importance
    if (updateFields.groupId !== undefined) updateData.groupId = updateFields.groupId ?? null
    if (updateFields.parentTaskId !== undefined) updateData.parentTaskId = updateFields.parentTaskId ?? null

    // Set countPerPeriod if changed
    if (updateFields.countPerPeriod !== undefined) {
      updateData.countPerPeriod = updateFields.countPerPeriod
    }

    // Set targetCount (use calculated if auto-calculated, otherwise use provided or existing)
    if (targetCount !== existingHabit.targetCount) {
      updateData.targetCount = targetCount
    }

    // Set startDate
    if (updateFields.startDate !== undefined) {
      updateData.startDate = updateFields.startDate ? new Date(updateFields.startDate) : null
    }

    // Set endDate
    if (updateFields.endDate !== undefined) {
      updateData.endDate = updateFields.endDate ? new Date(updateFields.endDate) : null
    }
    
    // Set activeDays
    if (updateFields.activeDays !== undefined) {
      if (finalType === "WEEKLY") {
        updateData.activeDays = updateFields.activeDays || []
      } else {
        updateData.activeDays = []
      }
    } else if (updateFields.type !== undefined && updateFields.type !== "WEEKLY") {
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

    // Handle labelIds update if provided
    if (labelIds !== undefined) {
      // Get current labels
      const currentLabels = await prisma.habitLabel.findMany({
        where: { habitId: id },
        select: { labelId: true },
      })
      const currentLabelIds = currentLabels.map((hl) => hl.labelId)
      
      // Get inherited labels that cannot be removed
      const inheritedLabels = await getInheritedLabelsFromHabit(id, userId)

      // Treat inherited labels as always selected. Some clients may omit them from payload.
      const effectiveLabelIds = [...new Set([...labelIds, ...inheritedLabels])]
      const labelsChanged =
        effectiveLabelIds.length !== currentLabelIds.length ||
        effectiveLabelIds.some((lid) => !currentLabelIds.includes(lid))
      if (labelsChanged) {
      
      // Labels to add (in labelIds but not in current)
      const labelsToAdd = effectiveLabelIds.filter((lid) => !currentLabelIds.includes(lid))
      
      // Labels to remove (in current but not in labelIds, and not inherited)
      const labelsToRemove = currentLabelIds.filter(
        (lid) => !effectiveLabelIds.includes(lid) && !inheritedLabels.includes(lid)
      )
      
      // Add new labels
      for (const labelId of labelsToAdd) {
        // Verify label belongs to user
        const label = await prisma.label.findFirst({
          where: { id: labelId, userId },
        })
        if (label) {
          await prisma.habitLabel.create({
            data: {
              habitId: id,
              labelId,
            },
          }).catch(() => {
            // Ignore if already exists
          })
        }
      }
      
      // Remove labels (only non-inherited ones)
      for (const labelId of labelsToRemove) {
        await prisma.habitLabel.delete({
          where: {
            habitId_labelId: {
              habitId: id,
              labelId,
            },
          },
        }).catch(() => {
          // Ignore if doesn't exist
        })
      }
      }
    }

    // If parent changed, inherit labels and group from new parent
    if (parentTaskChanged && habit.parentTaskId && newParentTask) {
      const parentLabelIds = newParentTask.taskLabels.map((tl) => tl.labelId)
      const inheritedLabels = await getInheritedLabelsFromHabit(habit.id, userId)
      const allInheritedLabels = [...new Set([...inheritedLabels, ...parentLabelIds])]
      
      // Add inherited labels to the habit
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

      // Inherit group from parent if not explicitly set
      if (updateFields.groupId === undefined && newParentTask.groupId) {
        await prisma.habit.update({
          where: { id: habit.id },
          data: { groupId: newParentTask.groupId },
        })
        habit.groupId = newParentTask.groupId
      }
    }

    // Update aggregates if parentTaskId changed
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
    } else if (habit.parentTaskId && oldHabitProgress !== null) {
      // Same parent: contribution can still change when progress basis or importance changes.
      const newHabitProgress = await calculateHabitCompletion(habit.id)
      const contributionChanged =
        newHabitProgress !== oldHabitProgress ||
        habit.importance !== existingHabit.importance

      if (contributionChanged) {
        await updateHabitContribution(
          habit.id,
          oldHabitProgress,
          newHabitProgress,
          existingHabit.importance,
          habit.importance
        )
      }
    }

    // Reload habit to get updated labels
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

    // Calculate progress on-demand
    const progress = await calculateHabitCompletion(habit.id)

    return NextResponse.json({
      data: serializeHabit({
        ...updatedHabit!,
        progress,
      }),
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
