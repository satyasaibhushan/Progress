export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateHabitSchema } from "@/lib/validations/habit"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueHabitTitle } from "@/lib/validations/uniqueness"
import {
  calculateHabitCompletion,
} from "@/lib/progress-calculator"
import {
  getInheritedLabelsFromHabit,
  getInheritedGroupFromHabit,
  canChangeHabitGroup,
} from "@/lib/inheritance-helpers"
import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"
import { getUserTimezone } from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import { serializeHabit } from "@/lib/utils"
import { sumHabitLogCounts } from "@/lib/progress-model"
import { reconcileUserProgress } from "@/lib/server/progress/reconcile"
import { reconcileUserLabelInheritance } from "@/lib/server/inheritance/labels"
import { getEffectiveTaskBounds } from "@/lib/server/inheritance/bounds"
import { reconcileUserGroupInheritance } from "@/lib/server/inheritance/groups"

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

function normalizeActiveDays(activeDays: number[] | null | undefined): number[] {
  const normalized = (activeDays || [])
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)

  return Array.from(new Set(normalized))
}

function sameDays(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

// GET /api/habits/[id] - Get a specific habit
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)

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
    const metricLogs = await prisma.habitLog.findMany({
      where: { habitId: habit.id },
      select: {
        date: true,
        count: true,
      },
    })
    const periodMetrics = calculateHabitPeriodMetrics(habit, metricLogs, { timeZone: userTimeZone })
    const currentCount = sumHabitLogCounts(metricLogs)

    return NextResponse.json({
      data: serializeHabit({
        ...habit,
        currentCount,
        progress,
        ...periodMetrics,
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
    const userTimeZone = await getUserTimezone(userId)

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
    const requestedGroupIdInput = validatedData.groupId
    const parsedStartDate = parseDateInputToUTCDate(validatedData.startDate)
    const parsedEndDate = parseDateInputToUTCDate(validatedData.endDate)

    if (validatedData.startDate !== undefined && validatedData.startDate !== null && !parsedStartDate) {
      return NextResponse.json(
        { error: "Invalid startDate" },
        { status: 400 }
      )
    }

    if (validatedData.endDate !== undefined && validatedData.endDate !== null && !parsedEndDate) {
      return NextResponse.json(
        { error: "Invalid endDate" },
        { status: 400 }
      )
    }

    const finalStartDate = validatedData.startDate !== undefined
      ? (validatedData.startDate ? parsedStartDate : null)
      : existingHabit.startDate
    const finalEndDate = validatedData.endDate !== undefined
      ? (validatedData.endDate ? parsedEndDate : null)
      : existingHabit.endDate

    if (finalStartDate && finalEndDate && finalStartDate > finalEndDate) {
      return NextResponse.json(
        { error: "Habit start date must be on or before its end date" },
        { status: 400 }
      )
    }
    
    // Extract labelIds from validated data
    const { labelIds, ...updateFields } = validatedData

    // Validate unique title (if title is being updated)
    if (updateFields.title) {
      await validateUniqueHabitTitle(userId, updateFields.title, id)
    }

    const finalType = updateFields.type ?? existingHabit.type
    const finalCountPerPeriod = finalType === "DAILY"
      ? 1
      : (validatedData.countPerPeriod ?? existingHabit.countPerPeriod ?? 1)
    const finalMaxCountPerDay = validatedData.maxCountPerDay ?? existingHabit.maxCountPerDay ?? 1
    const finalActiveDays = finalType === "DAILY"
      ? (() => {
          const normalized = normalizeActiveDays(updateFields.activeDays ?? existingHabit.activeDays)
          return normalized.length > 0 ? normalized : [...ALL_DAYS]
        })()
      : []
    const targetCount = validatedData.targetCount ?? existingHabit.targetCount

    if (!targetCount || targetCount < 1) {
      return NextResponse.json(
        { error: "targetCount is required and must be positive." },
        { status: 400 }
      )
    }

    // Validate the final parent and apply inherited schedule/group constraints.
    let newParentTask = null
    const parentTaskChanged = updateFields.parentTaskId !== undefined && updateFields.parentTaskId !== existingHabit.parentTaskId
    const finalParentTaskId = updateFields.parentTaskId !== undefined
      ? updateFields.parentTaskId
      : existingHabit.parentTaskId
    let finalParentGroupId: string | null = null

    if (finalParentTaskId) {
      newParentTask = await prisma.task.findFirst({
        where: {
          id: finalParentTaskId,
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

      const parentBounds = await getEffectiveTaskBounds(newParentTask.id, userId)

      if (finalStartDate && parentBounds?.minStartDate && finalStartDate < parentBounds.minStartDate) {
        return NextResponse.json(
          { error: "Habit start date must be on or after parent task start date" },
          { status: 400 }
        )
      }

      if (finalEndDate && parentBounds?.maxEndDate && finalEndDate > parentBounds.maxEndDate) {
        return NextResponse.json(
          { error: "Habit end date must be on or before parent task deadline" },
          { status: 400 }
        )
      }


      if (finalStartDate && parentBounds?.maxEndDate && finalStartDate > parentBounds.maxEndDate) {
        return NextResponse.json(
          { error: "Habit start date must be on or before its ancestor deadline" },
          { status: 400 }
        )
      }

      if (finalEndDate && parentBounds?.minStartDate && finalEndDate < parentBounds.minStartDate) {
        return NextResponse.json(
          { error: "Habit end date must be on or after its ancestor start date" },
          { status: 400 }
        )
      }

      finalParentGroupId = newParentTask.groupId
      if (
        finalParentGroupId !== null &&
        requestedGroupIdInput !== undefined &&
        requestedGroupIdInput !== finalParentGroupId
      ) {
        return NextResponse.json(
          {
            error: "Cannot change group. This habit inherits its group from a parent task. Unlink it from the parent task to change the group.",
            inheritedGroupId: finalParentGroupId,
          },
          { status: 400 }
        )
      }
      if (finalParentGroupId !== null) {
        updateFields.groupId = finalParentGroupId
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
    if (groupChanged && !parentTaskChanged && !finalParentGroupId) {
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
    if (finalParentGroupId) {
      updateData.groupId = finalParentGroupId
    } else if (updateFields.groupId !== undefined) {
      updateData.groupId = updateFields.groupId ?? null
      updateData.directGroupId = updateFields.groupId ?? null
    } else if (parentTaskChanged) {
      updateData.groupId = existingHabit.directGroupId
    }
    if (updateFields.parentTaskId !== undefined) updateData.parentTaskId = updateFields.parentTaskId ?? null

    if (finalCountPerPeriod !== existingHabit.countPerPeriod) {
      updateData.countPerPeriod = finalCountPerPeriod
    }

    if (finalMaxCountPerDay !== (existingHabit.maxCountPerDay ?? 1)) {
      updateData.maxCountPerDay = finalMaxCountPerDay
    }

    // Set targetCount
    if (targetCount !== existingHabit.targetCount) {
      updateData.targetCount = targetCount
    }

    // Set startDate
    if (updateFields.startDate !== undefined) {
      updateData.startDate = updateFields.startDate ? parsedStartDate : null
    }

    // Set endDate
    if (updateFields.endDate !== undefined) {
      updateData.endDate = updateFields.endDate ? parsedEndDate : null
    }
    
    // Set activeDays (only DAILY uses active days)
    if (finalType === "DAILY") {
      const existingDays = normalizeActiveDays(existingHabit.activeDays)
      if (
        updateFields.activeDays !== undefined ||
        updateFields.type !== undefined ||
        !sameDays(existingDays, finalActiveDays)
      ) {
        updateData.activeDays = finalActiveDays
      }
    } else if (existingHabit.activeDays.length > 0 || updateFields.activeDays !== undefined || updateFields.type !== undefined) {
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
        where: { habitId: id, inheritedFromTaskId: null },
        select: { labelId: true },
      })
      const currentLabelIds = currentLabels.map((hl) => hl.labelId)
      
      // Get inherited labels that cannot be removed
      const inheritedLabels = await getInheritedLabelsFromHabit(id, userId)

      const directLabelIds = [...new Set(labelIds.filter(
        (labelId) => !inheritedLabels.includes(labelId)
      ))]
      const labelsChanged =
        directLabelIds.length !== currentLabelIds.length ||
        directLabelIds.some((lid) => !currentLabelIds.includes(lid))
      if (labelsChanged) {
      
      // Labels to add (in labelIds but not in current)
      const labelsToAdd = directLabelIds.filter((lid) => !currentLabelIds.includes(lid))
      
      // Labels to remove (in current but not in labelIds, and not inherited)
      const labelsToRemove = currentLabelIds.filter(
        (lid) => !directLabelIds.includes(lid)
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

    await reconcileUserGroupInheritance(userId)
    await reconcileUserLabelInheritance(userId)
    await reconcileUserProgress(userId)

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
    const metricLogs = await prisma.habitLog.findMany({
      where: { habitId: habit.id },
      select: {
        date: true,
        count: true,
      },
    })
    const periodMetrics = calculateHabitPeriodMetrics(updatedHabit!, metricLogs, { timeZone: userTimeZone })
    const currentCount = sumHabitLogCounts(metricLogs)

    return NextResponse.json({
      data: serializeHabit({
        ...updatedHabit!,
        currentCount,
        progress,
        ...periodMetrics,
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

    // Delete will cascade to habit logs due to schema onDelete: Cascade
    await prisma.habit.delete({
      where: {
        id: id,
      },
    })

    await reconcileUserGroupInheritance(userId)
    await reconcileUserLabelInheritance(userId)
    await reconcileUserProgress(userId)

    return NextResponse.json({ message: "Habit deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
