export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createLabelSchema } from "@/lib/validations/label"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"

// GET /api/labels - Get all labels for the authenticated user
export async function GET() {
  try {
    const { userId } = await getAuthenticatedUser()

    const labels = await prisma.label.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            taskLabels: true,
            habitLabels: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    })

    if (labels.length === 0) {
      return NextResponse.json({ data: labels })
    }

    const tasks = await prisma.task.findMany({
      where: { userId },
      select: {
        id: true,
        parentId: true,
        progress: true,
        taskLabels: {
          select: {
            labelId: true,
          },
        },
      },
    })

    const habits = await prisma.habit.findMany({
      where: { userId },
      select: {
        id: true,
        currentCount: true,
        parentTaskId: true,
        targetCount: true,
        habitLabels: {
          select: {
            labelId: true,
          },
        },
      },
    })

    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const childCount = new Map<string, number>()

    for (const task of tasks) {
      if (!task.parentId) continue
      childCount.set(task.parentId, (childCount.get(task.parentId) || 0) + 1)
    }

    const taskLabelCache = new Map<string, Set<string>>()
    const getTaskLabelIds = (taskId: string): Set<string> => {
      if (taskLabelCache.has(taskId)) return taskLabelCache.get(taskId)!
      const task = taskById.get(taskId)
      if (!task) {
        const empty = new Set<string>()
        taskLabelCache.set(taskId, empty)
        return empty
      }
      const labelIds = new Set(task.taskLabels.map((tl) => tl.labelId))
      if (task.parentId) {
        const parentLabels = getTaskLabelIds(task.parentId)
        parentLabels.forEach((labelId) => labelIds.add(labelId))
      }
      taskLabelCache.set(taskId, labelIds)
      return labelIds
    }

    const labelCounts = new Map(
      labels.map((label) => [
        label.id,
        {
          incompleteTaskCount: 0,
          incompleteHabitCount: 0,
        },
      ])
    )

    for (const task of tasks) {
      const isLeaf = (childCount.get(task.id) || 0) === 0
      if (!isLeaf) continue
      const progress = Math.min(100, Math.max(0, task.progress || 0))
      if (progress >= 100) continue
      const labelIds = getTaskLabelIds(task.id)
      labelIds.forEach((labelId) => {
        const counts = labelCounts.get(labelId)
        if (counts) {
          counts.incompleteTaskCount += 1
        }
      })
    }

    for (const habit of habits) {
      const totalCount = habit.currentCount || 0
      const progress = habit.targetCount > 0
        ? Math.min(100, Math.round((totalCount / habit.targetCount) * 100))
        : 0
      if (progress >= 100) continue
      const labelIds = new Set(habit.habitLabels.map((hl) => hl.labelId))
      if (habit.parentTaskId) {
        const inheritedLabels = getTaskLabelIds(habit.parentTaskId)
        inheritedLabels.forEach((labelId) => labelIds.add(labelId))
      }
      labelIds.forEach((labelId) => {
        const counts = labelCounts.get(labelId)
        if (counts) {
          counts.incompleteHabitCount += 1
        }
      })
    }

    const labelsWithCounts = labels.map((label) => {
      const counts = labelCounts.get(label.id) || {
        incompleteTaskCount: 0,
        incompleteHabitCount: 0,
      }
      return {
        ...label,
        incompleteTaskCount: counts.incompleteTaskCount,
        incompleteHabitCount: counts.incompleteHabitCount,
        incompleteCount: counts.incompleteTaskCount + counts.incompleteHabitCount,
      }
    })

    const sortedLabels = [...labelsWithCounts].sort((a, b) => {
      const aCount = a.incompleteCount || 0
      const bCount = b.incompleteCount || 0
      if (aCount !== bCount) return bCount - aCount
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ data: sortedLabels })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/labels - Create a new label
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createLabelSchema.parse(body)

    // Check if label with same name already exists for this user
    const existingLabel = await prisma.label.findFirst({
      where: {
        userId,
        name: validatedData.name,
      },
    })

    if (existingLabel) {
      return NextResponse.json(
        { error: "Label with this name already exists" },
        { status: 400 }
      )
    }

    const label = await prisma.label.create({
      data: {
        ...validatedData,
        userId,
      },
      include: {
        _count: {
          select: {
            taskLabels: true,
            habitLabels: true,
          },
        },
      },
    })

    return NextResponse.json({ data: label }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
