export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { serializeTask } from "@/lib/utils"
import { getDateKeyInTimeZone, getUserTimezone } from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import {
  getInheritedLabelsFromTask,
  getInheritedGroupFromTask,
  canChangeTaskGroup,
  propagateDateBoundsToChildren,
} from "@/lib/inheritance-helpers"
import {
  attachHabitProgress,
  attachPeriodMetrics,
  loadLogsByHabitIds,
} from "@/lib/server/habits/log-metrics"
import { buildTaskTree, groupTasksByParentId } from "@/lib/server/tree/task-tree"
import { attachDerivedTaskProgress } from "@/lib/server/progress/apply"
import {
  getUserProgressModel,
  reconcileUserProgress,
} from "@/lib/server/progress/reconcile"
import { reconcileUserLabelInheritance } from "@/lib/server/inheritance/labels"
import { getEffectiveTaskBounds } from "@/lib/server/inheritance/bounds"
import { combineDateBounds, type EffectiveDateBounds } from "@/lib/hierarchy-bounds"
import { reconcileUserGroupInheritance } from "@/lib/server/inheritance/groups"

// GET /api/tasks/[id] - Get a specific task
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeChildren = searchParams.get("include") === "children"

    if (includeChildren) {
      // Fetch all tasks for this user to build the tree recursively
      const allTasks = await prisma.task.findMany({
        where: { userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          parent: {
            select: {
              id: true,
              title: true,
            },
          },
          taskLabels: {
            include: {
              label: true,
            },
          },
          habits: {
            include: {
              habitLabels: {
                include: {
                  label: true,
                },
              },
              group: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          _count: {
            select: {
              children: true,
              habits: true,
            },
          },
        },
        orderBy: [
          {
            importance: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      })

      const allHabits = allTasks.flatMap((task) => task.habits || [])
      if (allHabits.length > 0) {
        const logsByHabitId = await loadLogsByHabitIds(
          prisma,
          allHabits.map((habit) => habit.id)
        )
        attachHabitProgress(allHabits, logsByHabitId)
        attachPeriodMetrics(allHabits, logsByHabitId, userTimeZone)
      }
      attachDerivedTaskProgress(allTasks, allHabits)

      // Find the requested task
      const task = allTasks.find((t) => t.id === id)

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }

      const childrenByParentId = groupTasksByParentId(allTasks)

      const taskWithChildren = {
        ...task,
        children: buildTaskTree(childrenByParentId, task.id),
      }

      return NextResponse.json({ data: serializeTask(taskWithChildren) })
    }

    // If not including children, fetch just the task
    const task = await prisma.task.findFirst({
      where: {
        id,
        userId, // Security: only user's own tasks
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parent: {
          select: {
            id: true,
            title: true,
          },
        },
        taskLabels: {
          include: {
            label: true,
          },
        },
        habits: {
          include: {
            habitLabels: {
              include: {
                label: true,
              },
            },
            group: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (task.habits && task.habits.length > 0) {
      const logsByHabitId = await loadLogsByHabitIds(
        prisma,
        task.habits.map((habit) => habit.id)
      )
      attachHabitProgress(task.habits, logsByHabitId)
      attachPeriodMetrics(task.habits, logsByHabitId, userTimeZone)
    }

    const progressModel = await getUserProgressModel(userId)
    const derivedProgress = progressModel.tasks.get(task.id)
    if (derivedProgress) {
      task.progress = derivedProgress.progress
      task.total_weight = derivedProgress.isLeaf ? null : BigInt(derivedProgress.totalWeight)
      task.weighted_progress = derivedProgress.isLeaf
        ? null
        : BigInt(derivedProgress.weightedProgress)
    }

    return NextResponse.json({ data: serializeTask(task) })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/tasks/[id] - Update a task
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const userTimeZone = await getUserTimezone(userId)
    const { id } = await params

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
    })

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateTaskSchema.parse(body)
    const requestedGroupIdInput = validatedData.groupId
    const parsedStartDate = parseDateInputToUTCDate(validatedData.startDate)
    const parsedDeadline = parseDateInputToUTCDate(validatedData.deadline)

    if (validatedData.startDate !== undefined && validatedData.startDate !== null && !parsedStartDate) {
      return NextResponse.json(
        { error: "Invalid startDate" },
        { status: 400 }
      )
    }

    if (validatedData.deadline !== undefined && validatedData.deadline !== null && !parsedDeadline) {
      return NextResponse.json(
        { error: "Invalid deadline" },
        { status: 400 }
      )
    }

    // Validate that deadline is not in the past (if deadline is being updated)
    if (validatedData.deadline !== undefined && validatedData.deadline !== null && parsedDeadline) {
      const deadlineKey = parsedDeadline.toISOString().slice(0, 10)
      if (deadlineKey < getDateKeyInTimeZone(new Date(), userTimeZone)) {
        return NextResponse.json(
          { error: "Cannot set task deadline to a past date" },
          { status: 400 }
        )
      }
    }

    const finalStartDate = validatedData.startDate !== undefined
      ? (validatedData.startDate ? parsedStartDate : null)
      : existingTask.startDate

    const finalDeadline = validatedData.deadline !== undefined
      ? (validatedData.deadline ? parsedDeadline : null)
      : existingTask.deadline

    if (finalStartDate && finalDeadline && finalStartDate > finalDeadline) {
      return NextResponse.json(
        { error: "Task start date must be on or before its deadline" },
        { status: 400 }
      )
    }

    const startDateChanged = validatedData.startDate !== undefined &&
      (existingTask.startDate?.getTime() ?? null) !== (finalStartDate?.getTime() ?? null)
    const deadlineChanged = validatedData.deadline !== undefined &&
      (existingTask.deadline?.getTime() ?? null) !== (finalDeadline?.getTime() ?? null)
    const shouldPropagateDateBounds =
      (startDateChanged && !!finalStartDate) ||
      (deadlineChanged && !!finalDeadline)

    // Validate unique title at parent level (if title or parentId is being updated)
    const titleChanged = validatedData.title && validatedData.title !== existingTask.title
    const parentChanged = validatedData.parentId !== undefined && validatedData.parentId !== existingTask.parentId

    if (titleChanged || parentChanged) {
      const newTitle = validatedData.title ?? existingTask.title
      const newParentId = validatedData.parentId !== undefined ? validatedData.parentId : existingTask.parentId

      await validateUniqueTaskTitle(userId, newTitle, newParentId, id)
    }

    // If parentId is being updated, verify it exists and belongs to user
    let newParentTask = null
    if (validatedData.parentId !== undefined && validatedData.parentId !== null) {
      // Prevent circular references (task can't be its own parent or ancestor)
      if (validatedData.parentId === id) {
        return NextResponse.json(
          { error: "Task cannot be its own parent" },
          { status: 400 }
        )
      }

      newParentTask = await prisma.task.findFirst({
        where: {
          id: validatedData.parentId,
          userId,
        },
        select: {
          id: true,
          startDate: true,
          deadline: true,
          groupId: true,
        },
      })

      if (!newParentTask) {
        return NextResponse.json(
          { error: "Parent task not found" },
          { status: 404 }
        )
      }

      // Check if the new parent is a descendant of this task (would create circular reference)
      const isDescendant = await checkIfDescendant(id, validatedData.parentId)
      if (isDescendant) {
        return NextResponse.json(
          { error: "Cannot set a descendant task as parent (circular reference)" },
          { status: 400 }
        )
      }
    }

    // Validate schedule and inherited group against the final parent.
    const finalParentId = validatedData.parentId !== undefined 
      ? validatedData.parentId 
      : existingTask.parentId
    let finalParentGroupId: string | null = null
    let effectiveParentBounds: EffectiveDateBounds | null = null

    if (finalParentId) {
      const parentToCheck = newParentTask || await prisma.task.findFirst({
        where: { id: finalParentId, userId },
        select: { id: true, startDate: true, deadline: true, groupId: true },
      })

      if (parentToCheck) {
        effectiveParentBounds = await getEffectiveTaskBounds(parentToCheck.id, userId)
        finalParentGroupId = parentToCheck.groupId
        if (
          finalParentGroupId !== null &&
          requestedGroupIdInput !== undefined &&
          requestedGroupIdInput !== finalParentGroupId
        ) {
          return NextResponse.json(
            {
              error: "Cannot change group. This task inherits its group from a parent task. Unlink it from the parent task to change the group.",
              inheritedGroupId: finalParentGroupId,
            },
            { status: 400 }
          )
        }
        if (finalStartDate && effectiveParentBounds?.minStartDate && finalStartDate < effectiveParentBounds.minStartDate) {
          return NextResponse.json(
            { error: "Child task start date must be on or after parent task start date" },
            { status: 400 }
          )
        }

        if (finalDeadline && effectiveParentBounds?.maxEndDate) {
          if (finalDeadline > effectiveParentBounds.maxEndDate) {
            return NextResponse.json(
              { error: "Child task deadline must be on or before parent task deadline" },
              { status: 400 }
            )
          }
        }

        if (finalStartDate && effectiveParentBounds?.maxEndDate && finalStartDate > effectiveParentBounds.maxEndDate) {
          return NextResponse.json(
            { error: "Child task start date must be on or before its ancestor deadline" },
            { status: 400 }
          )
        }

        if (finalDeadline && effectiveParentBounds?.minStartDate && finalDeadline < effectiveParentBounds.minStartDate) {
          return NextResponse.json(
            { error: "Child task deadline must be on or after its ancestor start date" },
            { status: 400 }
          )
        }

        if (finalParentGroupId !== null) {
          validatedData.groupId = finalParentGroupId
        }
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

    // Check if group can be changed (not inherited from parent)
    // Only check when group is actually changed (not just included in payload).
    const groupChanged = validatedData.groupId !== undefined &&
      validatedData.groupId !== existingTask.groupId
    if (groupChanged && !parentChanged && !finalParentGroupId) {
      const canChange = await canChangeTaskGroup(id, userId)
      if (!canChange) {
        const inheritedGroup = await getInheritedGroupFromTask(id, userId)
        return NextResponse.json(
          { 
            error: "Cannot change group. This task inherits its group from a parent task. Unlink it from the parent task to change the group.",
            inheritedGroupId: inheritedGroup,
          },
          { status: 400 }
        )
      }
    }

    // Prevent progress updates for tasks with children or habits
    if (validatedData.progress !== undefined) {
      const hasChildren = existingTask._count.children > 0
      const hasHabits = existingTask._count.habits > 0
      
      if (hasChildren || hasHabits) {
        return NextResponse.json(
          { error: "Cannot set progress for tasks with child tasks or linked habits. Progress is automatically calculated." },
          { status: 400 }
        )
      }
    }

    // Convert startDate and deadline strings to Date if provided
    const {
      startDate: startDateStr,
      deadline: deadlineStr,
      groupId: requestedGroupId,
      labelIds,
      ...rest
    } = validatedData
    const updateData: {
      title?: string
      description?: string | null
      importance?: number
      progress?: number
      startDate?: Date | null
      deadline?: Date | null
      groupId?: string | null
      directGroupId?: string | null
      parentId?: string | null
    } = {
      ...rest,
      ...(startDateStr !== undefined && {
        startDate: startDateStr ? parsedStartDate : null,
      }),
      ...(deadlineStr !== undefined && {
        deadline: deadlineStr ? parsedDeadline : null,
      }),
      ...(finalParentGroupId
        ? { groupId: finalParentGroupId }
        : requestedGroupId !== undefined
          ? { groupId: requestedGroupId, directGroupId: requestedGroupId }
          : parentChanged
            ? { groupId: existingTask.directGroupId }
            : {}),
    }

    const task = await prisma.task.update({
      where: {
        id,
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
        parent: {
          select: {
            id: true,
            title: true,
          },
        },
        taskLabels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
    })

    await reconcileUserGroupInheritance(userId)

    if (shouldPropagateDateBounds || parentChanged) {
      const effectiveBounds = combineDateBounds(
        effectiveParentBounds || { minStartDate: null, maxEndDate: null },
        finalStartDate,
        finalDeadline
      )
      await propagateDateBoundsToChildren(
        task.id,
        effectiveBounds.minStartDate,
        effectiveBounds.maxEndDate,
        userId
      )
    }

    // Handle labelIds update if provided
    if (labelIds !== undefined) {
      // Get current labels
      const currentLabels = await prisma.taskLabel.findMany({
        where: { taskId: id, inheritedFromTaskId: null },
        select: { labelId: true },
      })
      const currentLabelIds = currentLabels.map((tl) => tl.labelId)
      
      // Get inherited labels that cannot be removed
      const inheritedLabels = await getInheritedLabelsFromTask(id, userId)

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
          await prisma.taskLabel.create({
            data: {
              taskId: id,
              labelId,
            },
          }).catch(() => {
            // Ignore if already exists
          })
        }
      }
      
      // Remove labels (only non-inherited ones)
      for (const labelId of labelsToRemove) {
        await prisma.taskLabel.delete({
          where: {
            taskId_labelId: {
              taskId: id,
              labelId,
            },
          },
        }).catch(() => {
          // Ignore if doesn't exist
        })
      }
      
      }
    }

    await reconcileUserLabelInheritance(userId)
    await reconcileUserProgress(userId)

    // Reload task to get updated labels, children, and habits
    // Fetch all tasks to build the tree recursively with all habits
    const allTasks = await prisma.task.findMany({
      where: { userId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parent: {
          select: {
            id: true,
            title: true,
          },
        },
        taskLabels: {
          include: {
            label: true,
          },
        },
        habits: {
          include: {
            habitLabels: {
              include: {
                label: true,
              },
            },
            group: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
      orderBy: [
        {
          importance: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    })

    // Find the updated task
    const updatedTask = allTasks.find((t) => t.id === task.id)

    if (!updatedTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const childrenByParentId = groupTasksByParentId(allTasks)

    const taskWithChildren = {
      ...updatedTask,
      children: buildTaskTree(childrenByParentId, updatedTask.id),
    }

    return NextResponse.json({ data: serializeTask(taskWithChildren) })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
    })

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Delete will cascade to children due to schema onDelete: Cascade
    await prisma.task.delete({
      where: {
        id,
      },
    })

    await reconcileUserGroupInheritance(userId)
    await reconcileUserLabelInheritance(userId)
    await reconcileUserProgress(userId)

    return NextResponse.json({ message: "Task deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}

// Helper function to check if potentialDescendant is a descendant of taskId
async function checkIfDescendant(
  taskId: string,
  potentialDescendantId: string
): Promise<boolean> {
  let currentId: string | null = potentialDescendantId

  // Traverse up the tree from potentialDescendant
  while (currentId !== null) {
    if (currentId === taskId) {
      return true // Found taskId in the ancestry chain
    }

    const task: { parentId: string | null } | null = await prisma.task.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    })

    currentId = task?.parentId ?? null
  }

  return false
}
