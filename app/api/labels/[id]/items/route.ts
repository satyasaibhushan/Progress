export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { serializeTasks, serializeHabits } from "@/lib/utils"

// GET /api/labels/[id]/items - Get all tasks and habits with this label (including inherited)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if label exists and belongs to user
    const label = await prisma.label.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!label) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    // Get all tasks for this user (we'll filter by label including inheritance)
    const allTasks = await prisma.task.findMany({
      where: {
        userId,
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
            group: {
              select: {
                id: true,
                name: true,
                color: true,
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

    // Filter tasks that have this label (directly or through inheritance)
    // A task has a label if:
    // 1. It has the label directly, OR
    // 2. Any of its ancestors has the label
    const tasksWithLabel = allTasks.filter((task) => {
      // Check if task itself has the label
      if (task.taskLabels.some((tl) => tl.labelId === id)) {
        return true
      }
      
      // Check ancestors
      let currentTask = task
      while (currentTask.parent) {
        const parentTask = allTasks.find((t) => t.id === currentTask.parentId)
        if (!parentTask) break
        if (parentTask.taskLabels.some((tl) => tl.labelId === id)) {
          return true
        }
        currentTask = parentTask
      }
      
      return false
    })

    // Build task tree for tasks with this label
    const buildTaskTree = (parentId: string | null): typeof tasksWithLabel => {
      return tasksWithLabel
        .filter((task) => task.parentId === parentId)
        .map((task) => ({
          ...task,
          children: buildTaskTree(task.id),
        }))
    }

    const rootTasks = buildTaskTree(null)

    // Get all habits for this user
    const allHabits = await prisma.habit.findMany({
      where: {
        userId,
      },
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
        parentTask: {
          select: {
            id: true,
            title: true,
            parentId: true,
            parent: {
              select: {
                id: true,
              },
            },
          },
        },
        habitLogs: {
          select: {
            id: true,
            date: true,
            count: true,
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

    // Filter habits that have this label (directly or through parent task inheritance)
    const habitsWithLabel = allHabits.filter((habit) => {
      // Check if habit itself has the label
      if (habit.habitLabels.some((hl) => hl.labelId === id)) {
        return true
      }
      
      // Check if parent task (or any ancestor) has the label
      if (habit.parentTask) {
        let currentTask = habit.parentTask
        while (currentTask) {
          const parentTask = allTasks.find((t) => t.id === currentTask.id)
          if (parentTask && parentTask.taskLabels.some((tl) => tl.labelId === id)) {
            return true
          }
          if (!currentTask.parent) break
          const parentTaskData = allTasks.find((t) => t.id === currentTask.parentId)
          if (!parentTaskData) break
          currentTask = parentTaskData as any
        }
      }
      
      return false
    })

    // Also get habits that are linked to tasks with this label
    const taskIdsWithLabel = new Set(tasksWithLabel.map((t) => t.id))
    const linkedHabits = allHabits.filter((habit) => {
      if (habit.parentTaskId && taskIdsWithLabel.has(habit.parentTaskId)) {
        return true
      }
      return false
    })

    // Combine and deduplicate habits
    const allHabitsWithLabel = Array.from(
      new Map([...habitsWithLabel, ...linkedHabits].map((h) => [h.id, h])).values()
    )

    return NextResponse.json({
      data: {
        label,
        tasks: serializeTasks(rootTasks),
        habits: serializeHabits(allHabitsWithLabel),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
