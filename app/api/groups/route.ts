export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGroupSchema } from "@/lib/validations/group"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueGroupName } from "@/lib/validations/uniqueness"

// GET /api/groups - Get all groups for the authenticated user with optional limit
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined

    const groups = await prisma.group.findMany({
      where: { userId },
      take: limit,
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const [allTasks, allHabits] = await Promise.all([
      prisma.task.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          description: true,
          progress: true,
          importance: true,
          groupId: true,
          parentId: true,
          total_weight: true,
          weighted_progress: true,
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
              groupId: true,
              parentId: true,
            },
          },
          _count: {
            select: {
              children: true,
              habits: true,
            },
          },
        },
      }),
      prisma.habit.findMany({
        where: { userId },
        include: {
          parentTask: {
            select: {
              id: true,
              groupId: true,
              parentId: true,
              parent: {
                select: {
                  id: true,
                  groupId: true,
                },
              },
            },
          },
        },
      }),
    ])

    const taskById = new Map(allTasks.map((task) => [task.id, task]))
    const getHabitProgress = (habit: { currentCount?: number | null; targetCount: number }) => {
      const totalCount = habit.currentCount || 0
      return habit.targetCount > 0
        ? Math.min(100, Math.round((totalCount / habit.targetCount) * 100))
        : 0
    }

    const groupsWithProgress = groups.map((group) => {
      const tasksInGroup = allTasks.filter((task) => {
        if (task.groupId === group.id) return true
        let currentTask = task
        const visited = new Set<string>()
        while (currentTask.parentId && !visited.has(currentTask.id)) {
          visited.add(currentTask.id)
          const parentTask = taskById.get(currentTask.parentId)
          if (!parentTask) break
          if (parentTask.groupId === group.id) return true
          currentTask = parentTask
        }
        return false
      })

      const habitsInGroup = allHabits.filter((habit) => {
        if (habit.groupId === group.id) return true
        if (habit.parentTask) {
          let currentTask = habit.parentTask as { id: string; groupId: string | null; parentId: string | null; parent: { id: string; groupId: string | null } | null }
          const visited = new Set<string>()
          while (currentTask && !visited.has(currentTask.id)) {
            visited.add(currentTask.id)
            if (currentTask.groupId === group.id) return true
            if (!currentTask.parentId) break
            const parentTask = taskById.get(currentTask.parentId)
            if (!parentTask) break
            currentTask = parentTask as typeof currentTask
          }
        }
        return false
      })

      const taskIdsInGroup = new Set(tasksInGroup.map((task) => task.id))
      const linkedHabits = allHabits.filter((habit) => {
        if (habit.parentTaskId && taskIdsInGroup.has(habit.parentTaskId)) {
          return true
        }
        return false
      })

      const allHabitsInGroup = Array.from(
        new Map([...habitsInGroup, ...linkedHabits].map((habit) => [habit.id, habit])).values()
      )

      const rootTasks = tasksInGroup.filter((task) => !task.parentId)
      const rootHabits = allHabitsInGroup.filter((habit) => {
        return !habit.parentTaskId || !taskIdsInGroup.has(habit.parentTaskId)
      })

      let totalWeight = 0
      let weightedProgress = 0

      for (const task of rootTasks) {
        const isLeaf = task._count.children === 0 && task._count.habits === 0
        if (isLeaf) {
          const taskProgress = Math.min(100, Math.max(0, task.progress || 0))
          totalWeight += task.importance
          weightedProgress += taskProgress * task.importance
        } else if (task.total_weight && task.weighted_progress) {
          const taskWeight = Number(task.total_weight)
          const taskWeightedProgress = Number(task.weighted_progress)
          if (taskWeight > 0) {
            totalWeight += taskWeight
            weightedProgress += taskWeightedProgress
          }
        }
      }

      for (const habit of rootHabits) {
        const habitProgress = getHabitProgress(habit)
        totalWeight += habit.importance
        weightedProgress += habitProgress * habit.importance
      }

      const progress = totalWeight > 0
        ? Math.min(100, Math.max(0, Math.round(weightedProgress / totalWeight)))
        : 0

      const allLeafTasks = tasksInGroup.filter((task) => {
        const hasChildrenInGroup = tasksInGroup.some((other) => other.parentId === task.id)
        return !hasChildrenInGroup
      })

      const incompleteTaskCount = allLeafTasks.filter((task) => {
        const taskProgress = Math.min(100, Math.max(0, task.progress || 0))
        return taskProgress < 100
      }).length

      const incompleteHabitCount = allHabitsInGroup.filter((habit) => {
        return getHabitProgress(habit) < 100
      }).length

      const incompleteCount = incompleteTaskCount + incompleteHabitCount

      return {
        ...group,
        progress: Math.min(100, Math.max(0, progress)),
        taskCount: allLeafTasks.length,
        habitCount: allHabitsInGroup.length,
        incompleteTaskCount,
        incompleteHabitCount,
        incompleteCount,
      }
    })

    const sortedGroups = [...groupsWithProgress].sort((a, b) => {
      const aCount = (a as any).incompleteCount || 0
      const bCount = (b as any).incompleteCount || 0
      if (aCount !== bCount) return bCount - aCount
      const aProgress = typeof a.progress === "number" ? a.progress : 0
      const bProgress = typeof b.progress === "number" ? b.progress : 0
      if (aProgress !== bProgress) return bProgress - aProgress
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ data: sortedGroups })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createGroupSchema.parse(body)

    // Validate unique name
    await validateUniqueGroupName(userId, validatedData.name)

    const group = await prisma.group.create({
      data: {
        ...validatedData,
        userId,
      },
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
    })

    return NextResponse.json({ data: group }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
