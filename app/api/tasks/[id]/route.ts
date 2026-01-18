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
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
        ...(includeChildren && {
          children: {
            include: {
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
          },
        }),
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

    // Convert deadline string to Date if provided
    const { deadline: deadlineStr, ...rest } = validatedData
    const updateData: {
      title?: string
      description?: string | null
      importance?: number
      progress?: number
      deadline?: Date | null
      groupId?: string | null
      parentId?: string | null
    } = {
      ...rest,
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

    return NextResponse.json({ data: serializeTask(task) })
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
