import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { addChildToTask } from "@/lib/progress-calculator"
import { serializeTask, serializeTasks } from "@/lib/utils"
import {
  getInheritedLabelsFromTask,
  getInheritedGroupFromTask,
  propagateLabelsToChildren,
  propagateGroupToChildren,
} from "@/lib/inheritance-helpers"

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
    const where: {
      userId: string
      groupId?: string
      parentId?: string | null
    } = { userId }

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

    // If includeChildren is true, we need to fetch all tasks and build the tree recursively
    if (includeChildren) {
      // First, fetch all tasks for this user (or filtered by groupId)
      const allTasksWhere: {
        userId: string
        groupId?: string
      } = { userId }
      if (groupId) {
        allTasksWhere.groupId = groupId
      }

      const allTasks = await prisma.task.findMany({
        where: allTasksWhere,
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
          habits: {
            include: {
              habitLabels: {
                include: {
                  label: true,
                },
              },
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

      // Build the tree structure recursively
      const buildTaskTree = (parentId: string | null): typeof allTasks => {
        return allTasks
          .filter((task) => task.parentId === parentId)
          .map((task) => ({
            ...task,
            children: buildTaskTree(task.id),
          }))
      }

      // Filter root tasks based on parentId filter
      const rootTasks = parentId === null 
        ? buildTaskTree(null)
        : parentId === "null"
        ? buildTaskTree(null)
        : buildTaskTree(parentId)

      return NextResponse.json({ data: serializeTasks(rootTasks) })
    }

    // If not including children, use the original query
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
        habits: {
          include: {
            habitLabels: {
              include: {
                label: true,
              },
            },
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

    return NextResponse.json({ data: serializeTasks(tasks) })
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
    let parentTask = null
    if (validatedData.parentId) {
      parentTask = await prisma.task.findFirst({
        where: {
          id: validatedData.parentId,
          userId,
        },
        select: {
          id: true,
          deadline: true,
          groupId: true,
          parentId: true,
          taskLabels: {
            select: { labelId: true },
          },
        },
      })

      if (!parentTask) {
        return NextResponse.json(
          { error: "Parent task not found" },
          { status: 404 }
        )
      }

      // Validate: child deadline must be before parent deadline (if both have deadlines)
      if (validatedData.deadline && parentTask.deadline) {
        const childDeadline = new Date(validatedData.deadline)
        const parentDeadline = new Date(parentTask.deadline)

        if (childDeadline >= parentDeadline) {
          return NextResponse.json(
            { error: "Child task deadline must be before parent task deadline" },
            { status: 400 }
          )
        }
      }

      // Inherit group from parent if not explicitly set
      if (!validatedData.groupId && parentTask.groupId) {
        validatedData.groupId = parentTask.groupId
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
    const taskData = {
      title: validatedData.title,
      description: validatedData.description ?? null,
      importance: validatedData.importance,
      progress: validatedData.progress ?? 0,
      deadline: validatedData.deadline ? new Date(validatedData.deadline) : null,
      groupId: validatedData.groupId ?? null,
      parentId: validatedData.parentId ?? null,
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

    // If task has a parent, inherit labels from parent
    if (task.parentId && parentTask && parentTask.taskLabels) {
      // Get direct parent labels
      const parentLabelIds = parentTask.taskLabels.map((tl) => tl.labelId)
      
      // Also get labels from parent's ancestors (if parent has a parent)
      let ancestorLabels: string[] = []
      if (parentTask.parentId) {
        ancestorLabels = await getInheritedLabelsFromTask(parentTask.id, userId)
      }
      
      const allInheritedLabels = [...new Set([...parentLabelIds, ...ancestorLabels])]
      
      // Add inherited labels to the new task
      if (allInheritedLabels.length > 0) {
        await Promise.all(
          allInheritedLabels.map((labelId) =>
            prisma.taskLabel.create({
              data: {
                taskId: task.id,
                labelId,
              },
            }).catch(() => {
              // Ignore if label already exists
            })
          )
        )
      }
    }

    // If this is a leaf task (no children, no habits) and has a parent, add it to parent's aggregates
    const isLeaf = task._count.children === 0 && task._count.habits === 0
    if (isLeaf && task.parentId) {
      const taskProgress = (task as { progress?: number | null }).progress ?? 0
      const weight = BigInt(task.importance)
      const weightedProgress = BigInt(Math.round(taskProgress * task.importance))
      await addChildToTask(task.parentId, weight, weightedProgress)
    }

    // Reload task with updated labels
    const updatedTask = await prisma.task.findUnique({
      where: { id: task.id },
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

    return NextResponse.json({ data: serializeTask(updatedTask!) }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
