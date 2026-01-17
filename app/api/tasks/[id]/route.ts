import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"

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
        labels: {
          include: {
            label: true,
          },
        },
        habits: {
          include: {
            labels: {
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
              labels: {
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

    return NextResponse.json({ data: task })
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
    })

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

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
    if (validatedData.parentId !== undefined && validatedData.parentId !== null) {
      // Prevent circular references (task can't be its own parent or ancestor)
      if (validatedData.parentId === id) {
        return NextResponse.json(
          { error: "Task cannot be its own parent" },
          { status: 400 }
        )
      }

      const parentTask = await prisma.task.findFirst({
        where: {
          id: validatedData.parentId,
          userId,
        },
      })

      if (!parentTask) {
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

    // Convert deadline string to Date if provided
    const updateData: any = { ...validatedData }
    if (validatedData.deadline) {
      updateData.deadline = new Date(validatedData.deadline)
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
        labels: {
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

    return NextResponse.json({ data: task })
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
