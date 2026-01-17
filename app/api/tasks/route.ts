import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { addChildToTask } from "@/lib/progress-calculator"

// GET /api/tasks - Get all tasks for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    // Optional filters
    const parentId = searchParams.get("parentId")
    const groupId = searchParams.get("groupId")
    const includeChildren = searchParams.get("include") === "children"

    // Build where clause
    const where: any = { userId }

    // Filter by parentId (use "null" string to get root tasks)
    if (parentId !== null) {
      if (parentId === "null") {
        where.parentId = null
      } else {
        where.parentId = parentId
      }
    }

    // Filter by groupId
    if (groupId) {
      where.groupId = groupId
    }

    const tasks = await prisma.task.findMany({
      where,
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
        ...(includeChildren && {
          children: {
            include: {
              labels: {
                include: {
                  label: true,
                },
              },
            },
          },
        }),
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

    return NextResponse.json({ data: tasks })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createTaskSchema.parse(body)

    // Validate unique title at this parent level
    await validateUniqueTaskTitle(
      userId,
      validatedData.title,
      validatedData.parentId || null
    )

    // If parentId is provided, verify it exists and belongs to user
    if (validatedData.parentId) {
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

    // Convert deadline string to Date if provided
    const taskData: any = {
      ...validatedData,
      userId,
    }

    if (validatedData.deadline) {
      taskData.deadline = new Date(validatedData.deadline)
    }

    const task = await prisma.task.create({
      data: taskData,
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

    // If this is a leaf task (no children, no habits) and has a parent, add it to parent's aggregates
    const isLeaf = task._count.children === 0 && task._count.habits === 0
    if (isLeaf && task.parentId) {
      const weight = BigInt(task.importance)
      const weightedProgress = BigInt(Math.round((task.progress || 0) * task.importance))
      await addChildToTask(task.parentId, weight, weightedProgress)
    }

    return NextResponse.json({ data: task }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
