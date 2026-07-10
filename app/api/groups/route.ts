export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGroupSchema } from "@/lib/validations/group"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueGroupName } from "@/lib/validations/uniqueness"
import { buildTaskGraph, hasGroupInTaskAncestry } from "@/lib/server/labels-groups/membership"
import { deriveProgressModel } from "@/lib/progress-model"
import { parseStrictIntegerParam } from "@/lib/server/pagination/cursor"

// GET /api/groups - Get all groups for the authenticated user with optional limit
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get("limit")
    let limit: number | undefined
    if (limitParam !== null) {
      const parsedLimit = parseStrictIntegerParam(limitParam)
      if (parsedLimit === null || parsedLimit <= 0) {
        return NextResponse.json(
          { error: "Invalid limit. Expected a positive integer." },
          { status: 400 }
        )
      }
      limit = Math.min(parsedLimit, 100)
    }

    const groups = await prisma.group.findMany({
      where: { userId },
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
          habitLogs: {
            select: {
              count: true,
            },
          },
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

    const taskGraph = buildTaskGraph(allTasks)
    const progressModel = deriveProgressModel(allTasks, allHabits)
    const groupMembershipMemo = new Map<string, boolean>()
    const getHabitProgress = (habit: { id: string }) => {
      return progressModel.habits.get(habit.id)?.progress || 0
    }

    const hasTaskInGroup = (taskId: string, groupId: string): boolean => {
      return hasGroupInTaskAncestry(taskId, groupId, taskGraph.taskById, groupMembershipMemo)
    }

    const groupsWithProgress = groups.map((group) => {
      const tasksInGroup = allTasks.filter((task) => {
        return hasTaskInGroup(task.id, group.id)
      })

      const habitsInGroup = allHabits.filter((habit) => {
        if (habit.groupId === group.id) return true
        if (habit.parentTaskId) {
          return hasTaskInGroup(habit.parentTaskId, group.id)
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

      const rootTasks = tasksInGroup.filter((task) => {
        return !task.parentId || !taskIdsInGroup.has(task.parentId)
      })
      const rootHabits = allHabitsInGroup.filter((habit) => {
        return !habit.parentTaskId || !taskIdsInGroup.has(habit.parentTaskId)
      })

      let totalWeight = 0
      let weightedProgress = 0

      for (const task of rootTasks) {
        const derived = progressModel.tasks.get(task.id)
        if (derived && derived.totalWeight > 0) {
          totalWeight += derived.totalWeight
          weightedProgress += derived.weightedProgress
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
        const children = taskGraph.childrenByParentId.get(task.id) || []
        const hasChildrenInGroup = children.some((childId) => taskIdsInGroup.has(childId))
        const hasLinkedHabits = allHabitsInGroup.some((habit) => habit.parentTaskId === task.id)
        return !hasChildrenInGroup && !hasLinkedHabits
      })

      const incompleteTaskCount = allLeafTasks.filter((task) => {
        const taskProgress = progressModel.tasks.get(task.id)?.progress || 0
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

    type GroupWithComputed = typeof groupsWithProgress[number]
    const sortedGroups = [...groupsWithProgress].sort((a, b) => {
      const aCount = (a as GroupWithComputed).incompleteCount || 0
      const bCount = (b as GroupWithComputed).incompleteCount || 0
      if (aCount !== bCount) return bCount - aCount
      const aProgress = typeof a.progress === "number" ? a.progress : 0
      const bProgress = typeof b.progress === "number" ? b.progress : 0
      if (aProgress !== bProgress) return bProgress - aProgress
      return a.name.localeCompare(b.name)
    })

    // `progress` and incomplete counts are derived from all of the user's
    // tasks/habits, so the database's createdAt order cannot be used to apply
    // the requested limit.  Slice only after computing and sorting the
    // derived values; otherwise `?limit=N` can omit the most relevant groups.
    return NextResponse.json({ data: limit === undefined ? sortedGroups : sortedGroups.slice(0, limit) })
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
