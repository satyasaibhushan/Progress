export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { serializeTasks, serializeHabits } from "@/lib/utils"
import { buildTaskGraph, hasLabelInTaskAncestry } from "@/lib/server/labels-groups/membership"
import { buildTaskTree, groupTasksByParentId } from "@/lib/server/tree/task-tree"
import { deriveProgressModel } from "@/lib/progress-model"

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
    const taskGraph = buildTaskGraph(allTasks)
    const directLabelIdsByTaskId = new Map<string, Set<string>>(
      allTasks.map((task) => [task.id, new Set(task.taskLabels.map((tl) => tl.labelId))])
    )
    const labelMembershipMemo = new Map<string, boolean>()
    const taskHasLabel = (taskId: string): boolean => {
      return hasLabelInTaskAncestry(
        taskId,
        id,
        taskGraph.taskById,
        directLabelIdsByTaskId,
        labelMembershipMemo
      )
    }

    // Filter tasks that have this label (directly or through inheritance)
    // A task has a label if:
    // 1. It has the label directly, OR
    // 2. Any of its ancestors has the label
    const tasksWithLabel = allTasks.filter((task) => {
      return taskHasLabel(task.id)
    })

    const tasksWithLabelChildrenByParentId = groupTasksByParentId(tasksWithLabel)
    const taskIdsWithLabel = new Set(tasksWithLabel.map((task) => task.id))
    const rootTasks = tasksWithLabel
      .filter((task) => !task.parentId || !taskIdsWithLabel.has(task.parentId))
      .map((task) => ({
        ...task,
        children: buildTaskTree(tasksWithLabelChildrenByParentId, task.id),
      }))

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

      if (habit.parentTaskId) {
        return taskHasLabel(habit.parentTaskId)
      }

      return false
    })

    // Also get habits that are linked to tasks with this label
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

    const progressModel = deriveProgressModel(allTasks, allHabits)
    const applyTaskProgress = (task: (typeof rootTasks)[number]): void => {
      const derived = progressModel.tasks.get(task.id)
      if (derived) {
        task.progress = derived.progress
        task.total_weight = derived.isLeaf ? null : BigInt(derived.totalWeight)
        task.weighted_progress = derived.isLeaf ? null : BigInt(derived.weightedProgress)
      }
      task.children.forEach(applyTaskProgress)
    }
    rootTasks.forEach(applyTaskProgress)

    for (const habit of allHabitsWithLabel) {
      const derived = progressModel.habits.get(habit.id)
      if (!derived) continue
      Object.assign(habit, derived)
    }

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
