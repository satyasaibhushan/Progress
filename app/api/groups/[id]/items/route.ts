import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { serializeTasks, serializeHabits } from "@/lib/utils"

// GET /api/groups/[id]/items - Get all tasks and habits for a group (including inherited)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if group exists and belongs to user
    const group = await prisma.group.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    // Get all tasks for this user (we'll filter by group including inheritance)
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
            groupId: true,
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

    // Filter tasks that belong to this group (directly or through inheritance)
    // A task belongs to a group if:
    // 1. It has groupId === id, OR
    // 2. Any of its ancestors has groupId === id
    const tasksInGroup = allTasks.filter((task) => {
      // Check if task itself has the group
      if (task.groupId === id) {
        return true
      }
      
      // Check ancestors recursively
      let currentTask = task
      const visited = new Set<string>() // Prevent infinite loops
      
      while (currentTask.parentId && !visited.has(currentTask.id)) {
        visited.add(currentTask.id)
        
        // Find parent in allTasks
        const parentTask = allTasks.find((t) => t.id === currentTask.parentId)
        if (!parentTask) break
        
        // Check if parent has the group
        if (parentTask.groupId === id) {
          return true
        }
        
        // Move up to parent
        currentTask = parentTask
      }
      
      return false
    })

    // Build task tree for tasks in this group
    // We need to find "root" tasks within the group context:
    // - Tasks with no parent (true root), OR
    // - Tasks whose parent is NOT in this group
    const taskIdsInGroup = new Set(tasksInGroup.map((t) => t.id))
    const rootTasksInGroup = tasksInGroup.filter((task) => {
      // If no parent, it's a root task
      if (!task.parentId) return true
      // If parent exists but is not in the group, this task is a "root" within the group
      return !taskIdsInGroup.has(task.parentId)
    })

    const buildTaskTree = (parentId: string | null): typeof tasksInGroup => {
      return tasksInGroup
        .filter((task) => task.parentId === parentId)
        .map((task) => ({
          ...task,
          children: buildTaskTree(task.id),
        }))
    }

    // Build tree starting from root tasks within the group
    const rootTasks = rootTasksInGroup.map((task) => ({
      ...task,
      children: buildTaskTree(task.id),
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

    // Filter habits that belong to this group (directly or through parent task inheritance)
    const habitsInGroup = allHabits.filter((habit) => {
      // Check if habit itself has the group
      if (habit.groupId === id) {
        return true
      }
      
      // Check if parent task (or any ancestor) has the group
      if (habit.parentTask) {
        let currentTask = habit.parentTask
        while (currentTask) {
          if (currentTask.groupId === id) {
            return true
          }
          if (!currentTask.parent) break
          // Find parent in allTasks
          const parentTask = allTasks.find((t) => t.id === currentTask.parentId)
          if (!parentTask) break
          currentTask = parentTask as any
        }
      }
      
      return false
    })

    // Also get habits that are linked to tasks in this group
    // (taskIdsInGroup is already defined above for root task filtering)
    const linkedHabits = allHabits.filter((habit) => {
      if (habit.parentTaskId && taskIdsInGroup.has(habit.parentTaskId)) {
        return true
      }
      return false
    })

    // Combine and deduplicate habits
    const allHabitsInGroup = Array.from(
      new Map([...habitsInGroup, ...linkedHabits].map((h) => [h.id, h])).values()
    )

    return NextResponse.json({
      data: {
        tasks: serializeTasks(rootTasks),
        habits: serializeHabits(allHabitsInGroup),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
