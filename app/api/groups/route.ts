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

    // Calculate progress for each group
    const groupsWithProgress = await Promise.all(
      groups.map(async (group) => {
        // Get all tasks and habits for this group (including inherited)
        const allTasks = await prisma.task.findMany({
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
        })

        const allHabits = await prisma.habit.findMany({
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
            habitLogs: {
              select: {
                count: true,
              },
            },
          },
        })

        // Filter tasks in group (including inheritance)
        const tasksInGroup = allTasks.filter((task) => {
          if (task.groupId === group.id) return true
          let currentTask = task
          const visited = new Set<string>() // Prevent infinite loops
          
          while (currentTask.parentId && !visited.has(currentTask.id)) {
            visited.add(currentTask.id)
            const parentTask = allTasks.find((t) => t.id === currentTask.parentId)
            if (!parentTask) break
            if (parentTask.groupId === group.id) return true
            currentTask = parentTask
          }
          return false
        })

        // Filter habits in group (including inheritance)
        const habitsInGroup = allHabits.filter((habit) => {
          if (habit.groupId === group.id) return true
          if (habit.parentTask) {
            let currentTask = habit.parentTask
            const visited = new Set<string>() // Prevent infinite loops
            while (currentTask && !visited.has(currentTask.id)) {
              visited.add(currentTask.id)
              if (currentTask.groupId === group.id) return true
              if (!currentTask.parent) break
              const parentTask = allTasks.find((t) => t.id === currentTask.parentId)
              if (!parentTask) break
              currentTask = parentTask as any
            }
          }
          return false
        })

        // Also get habits that are linked to tasks in this group
        const taskIdsInGroup = new Set(tasksInGroup.map((t) => t.id))
        const linkedHabits = allHabits.filter((habit) => {
          if (habit.parentTaskId && taskIdsInGroup.has(habit.parentTaskId)) {
            return true
          }
          return false
        })

        // Combine and deduplicate habits (same logic as detail API)
        const allHabitsInGroup = Array.from(
          new Map([...habitsInGroup, ...linkedHabits].map((h) => [h.id, h])).values()
        )

        // Get root tasks and habits (only top-level, not linked to tasks)
        const rootTasks = tasksInGroup.filter((t) => !t.parentId)
        // Get task IDs to exclude linked habits (habits linked to tasks are already counted in task's weighted_progress)
        const rootHabits = allHabitsInGroup.filter((h) => {
          // Only include habits that are not linked to any task in this group
          return !h.parentTaskId || !taskIdsInGroup.has(h.parentTaskId)
        })

        // Calculate weighted progress
        let totalWeight = 0
        let weightedProgress = 0

        for (const task of rootTasks) {
          const isLeaf = task._count.children === 0 && task._count.habits === 0
          if (isLeaf) {
            const taskProgress = Math.min(100, Math.max(0, task.progress || 0))
            totalWeight += task.importance
            weightedProgress += taskProgress * task.importance
          } else if (task.total_weight && task.weighted_progress) {
            // weighted_progress is already the sum of (progress * importance) for all children
            // total_weight is the sum of importance for all children
            // So we can use them directly without recalculating
            const taskWeight = Number(task.total_weight)
            const taskWeightedProgress = Number(task.weighted_progress)
            if (taskWeight > 0) {
              totalWeight += taskWeight
              weightedProgress += taskWeightedProgress
            }
          }
        }

        for (const habit of rootHabits) {
          const habitLogs = habit.habitLogs || []
          const totalCount = habitLogs.reduce((sum, log) => sum + log.count, 0)
          const habitProgress = habit.targetCount > 0
            ? Math.min(100, Math.round((totalCount / habit.targetCount) * 100))
            : 0
          totalWeight += habit.importance
          weightedProgress += habitProgress * habit.importance
        }

        // Ensure progress is between 0-100
        // weighted_progress is sum of (progress * importance) where progress is 0-100
        // total_weight is sum of importance
        // So weightedProgress / totalWeight gives us average progress (0-100)
        const progress = totalWeight > 0 
          ? Math.min(100, Math.max(0, Math.round(weightedProgress / totalWeight))) 
          : 0

        // Count leaf tasks - only count tasks that have no children IN THIS GROUP
        // This matches the logic in the detail API where we build a tree from tasksInGroup
        // A task is a leaf if it has no children that are also in this group
        const getAllLeafTasks = (taskList: typeof tasksInGroup): typeof tasksInGroup => {
          const leafTasks: typeof tasksInGroup = []
          
          // Check each task - it's a leaf if it has no children in this group
          taskList.forEach((task) => {
            // Check if this task has any children in the group
            const hasChildrenInGroup = taskList.some((t) => t.parentId === task.id)
            if (!hasChildrenInGroup) {
              leafTasks.push(task)
            }
          })
          
          return leafTasks
        }

        const allLeafTasks = getAllLeafTasks(tasksInGroup)

        return {
          ...group,
          progress: Math.min(100, Math.max(0, progress)),
          taskCount: allLeafTasks.length,
          habitCount: allHabitsInGroup.length,
        }
      })
    )

    return NextResponse.json({ data: groupsWithProgress })
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
