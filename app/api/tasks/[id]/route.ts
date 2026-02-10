export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import {
  updateLeafTaskProgress,
  updateLeafTaskWeight,
  addChildToTask,
  removeChildFromTask,
} from "@/lib/progress-calculator"
import { serializeTask } from "@/lib/utils"
import {
  getInheritedLabelsFromTask,
  getInheritedGroupFromTask,
  canChangeTaskGroup,
  propagateLabelsToChildren,
  propagateGroupToChildren,
} from "@/lib/inheritance-helpers"

// GET /api/tasks/[id] - Get a specific task
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
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

      // Find the requested task
      const task = allTasks.find((t) => t.id === id)

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }

      // Build the tree structure recursively starting from this task
      const buildTaskTree = (parentId: string | null): typeof allTasks => {
        return allTasks
          .filter((t) => t.parentId === parentId)
          .map((t) => ({
            ...t,
            children: buildTaskTree(t.id),
          }))
      }

      const taskWithChildren = {
        ...task,
        children: buildTaskTree(task.id),
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

    const wasLeaf = existingTask._count.children === 0 && existingTask._count.habits === 0

    const body = await request.json()
    const validatedData = updateTaskSchema.parse(body)

    // Validate that deadline is not in the past (if deadline is being updated)
    if (validatedData.deadline !== undefined && validatedData.deadline !== null) {
      const deadline = new Date(validatedData.deadline)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      deadline.setHours(0, 0, 0, 0)

      if (deadline < today) {
        return NextResponse.json(
          { error: "Cannot set task deadline to a past date" },
          { status: 400 }
        )
      }
    }

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
          deadline: true,
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

    // Validate deadline against parent (if parent exists or is being set)
    const finalParentId = validatedData.parentId !== undefined 
      ? validatedData.parentId 
      : existingTask.parentId

    if (finalParentId) {
      const parentToCheck = newParentTask || await prisma.task.findFirst({
        where: { id: finalParentId, userId },
        select: { id: true, deadline: true },
      })

      if (parentToCheck) {
        const taskDeadline = validatedData.deadline !== undefined
          ? (validatedData.deadline ? new Date(validatedData.deadline) : null)
          : existingTask.deadline

        // If both task and parent have deadlines, child must be before parent
        if (taskDeadline && parentToCheck.deadline) {
          const childDeadline = new Date(taskDeadline)
          const parentDeadline = new Date(parentToCheck.deadline)

          if (childDeadline >= parentDeadline) {
            return NextResponse.json(
              { error: "Child task deadline must be before parent task deadline" },
              { status: 400 }
            )
          }
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
    if (groupChanged && !parentChanged) {
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
    const { startDate: startDateStr, deadline: deadlineStr, labelIds, ...rest } = validatedData
    const updateData: {
      title?: string
      description?: string | null
      importance?: number
      progress?: number
      startDate?: Date | null
      deadline?: Date | null
      groupId?: string | null
      parentId?: string | null
    } = {
      ...rest,
      ...(startDateStr !== undefined && {
        startDate: startDateStr ? new Date(startDateStr) : null,
      }),
      ...(deadlineStr !== undefined && {
        deadline: deadlineStr ? new Date(deadlineStr) : null,
      }),
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

    // If parent changed, inherit labels and group from new parent
    if (parentChanged && task.parentId) {
      const inheritedLabels = await getInheritedLabelsFromTask(task.id, userId)
      // Get direct parent labels
      const newParent = await prisma.task.findFirst({
        where: { id: task.parentId, userId },
        include: {
          taskLabels: {
            select: { labelId: true },
          },
        },
      })
      
      if (newParent) {
        const parentLabelIds = newParent.taskLabels.map((tl) => tl.labelId)
        const allInheritedLabels = [...new Set([...inheritedLabels, ...parentLabelIds])]
        
        // Add inherited labels to the task
        for (const labelId of allInheritedLabels) {
          await prisma.taskLabel.create({
            data: {
              taskId: task.id,
              labelId,
            },
          }).catch(() => {
            // Ignore if label already exists
          })
        }

        // Inherit group from parent if not explicitly set
        if (!validatedData.groupId && newParent.groupId) {
          await prisma.task.update({
            where: { id: task.id },
            data: { groupId: newParent.groupId },
          })
          task.groupId = newParent.groupId
        }
      }
    }

    // If group changed, propagate to all children
    if (validatedData.groupId !== undefined) {
      await propagateGroupToChildren(task.id, task.groupId, userId)
    }

    // Handle labelIds update if provided
    if (labelIds !== undefined) {
      // Get current labels
      const currentLabels = await prisma.taskLabel.findMany({
        where: { taskId: id },
        select: { labelId: true },
      })
      const currentLabelIds = currentLabels.map((tl) => tl.labelId)
      
      // Get inherited labels that cannot be removed
      const inheritedLabels = await getInheritedLabelsFromTask(id, userId)

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
      
      // Propagate newly added labels to children
      if (labelsToAdd.length > 0) {
        await propagateLabelsToChildren(id, labelsToAdd, userId)
      }
      }
    }

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

    // Build the tree structure recursively starting from this task
    const buildTaskTree = (parentId: string | null): typeof allTasks => {
      return allTasks
        .filter((t) => t.parentId === parentId)
        .map((t) => ({
          ...t,
          children: buildTaskTree(t.id),
        }))
    }

    const taskWithChildren = {
      ...updatedTask,
      children: buildTaskTree(updatedTask.id),
    }

    const isLeaf = task._count.children === 0 && task._count.habits === 0
    const existingProgress = (existingTask as { progress?: number | null }).progress ?? 0
    const newProgress = (task as { progress?: number | null }).progress ?? 0
    const progressChanged = validatedData.progress !== undefined && validatedData.progress !== existingProgress
    const importanceChanged = validatedData.importance !== undefined && validatedData.importance !== existingTask.importance

    // Handle aggregate updates for leaf tasks
    if (isLeaf) {
      if (parentChanged) {
        // Remove from old parent if it existed
        if (existingTask.parentId && wasLeaf) {
          const oldWeight = BigInt(existingTask.importance)
          const oldWeightedProgress = BigInt(Math.round(existingProgress * existingTask.importance))
          await removeChildFromTask(existingTask.parentId, oldWeight, oldWeightedProgress)
        }
        // Add to new parent if it exists
        if (task.parentId) {
          const newWeight = BigInt(task.importance)
          const newWeightedProgress = BigInt(Math.round(newProgress * task.importance))
          await addChildToTask(task.parentId, newWeight, newWeightedProgress)
        }
      } else if (task.parentId) {
        // Parent didn't change, but progress or importance might have
        if (progressChanged) {
          await updateLeafTaskProgress(
            id,
            existingProgress,
            newProgress,
            task.importance
          )
        }
        if (importanceChanged) {
          await updateLeafTaskWeight(
            id,
            existingTask.importance,
            task.importance,
            newProgress
          )
        }
      }
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

    // Store parent ID and check if this is a leaf before deletion
    const parentId = existingTask.parentId
    const wasLeaf = existingTask._count.children === 0 && existingTask._count.habits === 0
    const existingProgress = (existingTask as { progress?: number | null }).progress ?? 0

    // Delete will cascade to children due to schema onDelete: Cascade
    await prisma.task.delete({
      where: {
        id,
      },
    })

    // Remove from parent's aggregates if this was a leaf task
    if (parentId && wasLeaf) {
      const weight = BigInt(existingTask.importance)
      const weightedProgress = BigInt(Math.round(existingProgress * existingTask.importance))
      await removeChildFromTask(parentId, weight, weightedProgress)
    }

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
