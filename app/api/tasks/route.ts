export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { addChildToTask } from "@/lib/progress-calculator"
import { serializeTask, serializeTasks } from "@/lib/utils"
import { getUserTimezone } from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import {
  getInheritedLabelsFromTask,
} from "@/lib/inheritance-helpers"
import { normalizeCursorPagination, getPaginatedWindow } from "@/lib/server/pagination/cursor"
import { createTaskComparator } from "@/lib/server/ranking/task-ranking"
import {
  buildTaskTree,
  groupTasksByParentId,
  treeContainsTaskId,
  type TreeNode,
} from "@/lib/server/tree/task-tree"
import { attachPeriodMetrics, loadLogsByHabitIds } from "@/lib/server/habits/log-metrics"

type TaskItem = {
  id: string
  parentId: string | null
  importance: number
  progress: number | null
  total_weight: bigint | null
  weighted_progress: bigint | null
  startDate: Date | null
  deadline: Date | null
  createdAt: Date
  updatedAt: Date
  habits?: HabitItem[]
  _count?: {
    children?: number
    habits?: number
  }
}

type HabitItem = {
  id: string
  importance: number
  currentCount: number
  targetCount: number
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  countPerPeriod?: number | null
  maxCountPerDay?: number | null
  activeDays?: number[] | null
  startDate?: Date | null
  endDate?: Date | null
}

// GET /api/tasks - Get all tasks for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const clampProgress = (value: number): number => {
      if (!Number.isFinite(value)) return 0
      return Math.min(100, Math.max(0, value))
    }

    // Optional filters
    const parentId = searchParams.get("parentId")
    const groupId = searchParams.get("groupId")
    const includeChildren = searchParams.get("include") === "children"
    const includeHabits = searchParams.get("includeHabits") !== "false"
    const userTimeZone = includeHabits ? await getUserTimezone(userId) : "UTC"
    const status = searchParams.get("status")
    const paginate = searchParams.get("paginate") === "true"
    const highlightId = searchParams.get("highlightId")
    const { limit, cursor } = normalizeCursorPagination({
      limitParam: searchParams.get("limit"),
      cursorParam: searchParams.get("cursor"),
    })
    const statusFilter = status === "active" || status === "future" || status === "completed"
      ? status
      : null

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
          ...(includeHabits
            ? {
                habits: {
                  include: {
                    habitLabels: {
                      include: {
                        label: true,
                      },
                    },
                  },
                },
              }
            : {}),
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
      const taskChildrenByParentId = groupTasksByParentId(allTasks as TaskItem[])

      if (includeHabits) {
        const allHabits = allTasks.flatMap((task) => (task as TaskItem).habits || [])
        const logsByHabitId = await loadLogsByHabitIds(
          prisma,
          allHabits.map((habit) => habit.id)
        )
        attachPeriodMetrics(allHabits, logsByHabitId, userTimeZone)

        const habitProgressByHabitId = new Map<string, number>()
        for (const habit of allHabits) {
          if (habitProgressByHabitId.has(habit.id)) continue
          const totalCount = habit.currentCount || 0
          const targetCount = habit.targetCount || 0
          const progress = targetCount > 0 ? (totalCount / targetCount) * 100 : 0
          const clampedProgress = clampProgress(progress)
          habitProgressByHabitId.set(habit.id, clampedProgress)
          const habitWithDerivedData = habit as { currentCount?: number; progress?: number }
          habitWithDerivedData.currentCount = totalCount
          habitWithDerivedData.progress = clampedProgress
        }

        type TaskContribution = {
          totalWeight: number
          weightedProgress: number
          progress: number
        }

        const contributionMemo = new Map<string, TaskContribution>()
        const computeTaskContribution = (task: TaskItem): TaskContribution => {
          const cached = contributionMemo.get(task.id)
          if (cached) return cached

          const directChildren = (taskChildrenByParentId.get(task.id) || []) as TaskItem[]
          const linkedHabits = task.habits || []

          if (directChildren.length === 0 && linkedHabits.length === 0) {
            const leafProgress = clampProgress(task.progress || 0)
            const leafWeight = Number(task.importance || 0)
            const leafWeightedProgress = Math.round(leafProgress * leafWeight)
            const leafContribution: TaskContribution = {
              totalWeight: leafWeight,
              weightedProgress: leafWeightedProgress,
              progress: leafProgress,
            }
            contributionMemo.set(task.id, leafContribution)
            return leafContribution
          }

          let totalWeight = 0
          let weightedProgress = 0

          for (const child of directChildren) {
            const childContribution = computeTaskContribution(child)
            totalWeight += childContribution.totalWeight
            weightedProgress += childContribution.weightedProgress
          }

          for (const habit of linkedHabits) {
            const habitWeight = Number(habit.importance || 0)
            const habitProgress = habitProgressByHabitId.get(habit.id) || 0
            totalWeight += habitWeight
            weightedProgress += Math.round(habitProgress * habitWeight)
          }

          const progress = totalWeight > 0
            ? clampProgress(Math.round((weightedProgress / totalWeight) * 100) / 100)
            : 0
          const contribution: TaskContribution = {
            totalWeight,
            weightedProgress,
            progress,
          }
          contributionMemo.set(task.id, contribution)
          return contribution
        }

        for (const task of allTasks) {
          const directChildren = (taskChildrenByParentId.get(task.id) || []) as TaskItem[]
          const linkedHabits = (task as TaskItem).habits || []
          if (directChildren.length === 0 && linkedHabits.length === 0) continue

          const contribution = computeTaskContribution(task as TaskItem)
          task.total_weight = BigInt(contribution.totalWeight)
          task.weighted_progress = BigInt(contribution.weightedProgress)
          task.progress = contribution.progress
        }
      }

      const { compare, getMeta } = createTaskComparator<TaskItem>()
      allTasks.sort((a, b) => compare(a as TaskItem, b as TaskItem))

      const buildTree = (treeParentId: string | null): Array<TreeNode<TaskItem>> => {
        return buildTaskTree(taskChildrenByParentId as Map<string | null, TaskItem[]>, treeParentId)
      }

      const rootTasks = parentId === null
        ? buildTree(null)
        : parentId === "null"
          ? buildTree(null)
          : buildTree(parentId)

      if (paginate || statusFilter) {
        const statusCounts = {
          active: 0,
          future: 0,
          completed: 0,
        }

        for (const rootTask of rootTasks) {
          const rank = getMeta(rootTask).rank
          if (rank === 0) statusCounts.active += 1
          else if (rank === 1) statusCounts.future += 1
          else statusCounts.completed += 1
        }

        const filteredRootTasks = statusFilter
          ? rootTasks.filter((rootTask) => {
              const rank = getMeta(rootTask).rank
              if (statusFilter === "active") return rank === 0
              if (statusFilter === "future") return rank === 1
              return rank === 2
            })
          : rootTasks

        if (paginate) {
          let highlightIndex = -1
          if (highlightId) {
            highlightIndex = filteredRootTasks.findIndex((rootTask) =>
              treeContainsTaskId(rootTask, highlightId)
            )
          }

          const page = getPaginatedWindow(filteredRootTasks, limit, cursor, {
            highlightIndex,
          })

          return NextResponse.json({
            data: serializeTasks(page.pageItems),
            pageInfo: {
              nextCursor: page.nextCursor,
              hasMore: page.nextCursor !== null,
            },
            statusCounts,
          })
        }

        return NextResponse.json({
          data: serializeTasks(filteredRootTasks),
          statusCounts,
        })
      }

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
        ...(includeHabits
          ? {
              habits: {
                include: {
                  habitLabels: {
                    include: {
                      label: true,
                    },
                  },
                },
              },
            }
          : {}),
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

    if (includeHabits) {
      const allHabits = tasks.flatMap((task) => (task as TaskItem).habits || [])
      const logsByHabitId = await loadLogsByHabitIds(
        prisma,
        allHabits.map((habit) => habit.id)
      )
      attachPeriodMetrics(allHabits, logsByHabitId, userTimeZone)
    }

    const { compare, getMeta } = createTaskComparator<TaskItem>()
    tasks.sort((a, b) => compare(a as TaskItem, b as TaskItem))

    if (paginate || statusFilter) {
      const statusCounts = {
        active: 0,
        future: 0,
        completed: 0,
      }

      for (const task of tasks) {
        const rank = getMeta(task).rank
        if (rank === 0) statusCounts.active += 1
        else if (rank === 1) statusCounts.future += 1
        else statusCounts.completed += 1
      }

      const filteredTasks = statusFilter
        ? tasks.filter((task) => {
            const rank = getMeta(task).rank
            if (statusFilter === "active") return rank === 0
            if (statusFilter === "future") return rank === 1
            return rank === 2
          })
        : tasks

      if (paginate) {
        let highlightIndex = -1
        if (highlightId) {
          highlightIndex = filteredTasks.findIndex((task) => task.id === highlightId)
        }

        const page = getPaginatedWindow(filteredTasks, limit, cursor, {
          highlightIndex,
        })

        return NextResponse.json({
          data: serializeTasks(page.pageItems),
          pageInfo: {
            nextCursor: page.nextCursor,
            hasMore: page.nextCursor !== null,
          },
          statusCounts,
        })
      }

      return NextResponse.json({
        data: serializeTasks(filteredTasks),
        statusCounts,
      })
    }

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

    // Validate that deadline is not in the past
    const parsedStartDate = parseDateInputToUTCDate(validatedData.startDate)
    const parsedDeadline = parseDateInputToUTCDate(validatedData.deadline)

    if (validatedData.deadline && !parsedDeadline) {
      return NextResponse.json(
        { error: "Invalid deadline" },
        { status: 400 }
      )
    }

    if (validatedData.startDate && !parsedStartDate) {
      return NextResponse.json(
        { error: "Invalid startDate" },
        { status: 400 }
      )
    }

    if (parsedDeadline) {
      const now = new Date()
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
      const deadline = new Date(parsedDeadline)

      if (deadline < today) {
        return NextResponse.json(
          { error: "Cannot create task with deadline in the past" },
          { status: 400 }
        )
      }
    }

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

      // Validate: child deadline must not be after parent deadline (if both have deadlines)
      if (parsedDeadline && parentTask.deadline) {
        const childDeadline = new Date(parsedDeadline)
        const parentDeadline = new Date(parentTask.deadline)

        if (childDeadline > parentDeadline) {
          return NextResponse.json(
            { error: "Child task deadline must be on or before parent task deadline" },
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

    // Convert startDate and deadline strings to Date if provided
    const taskData = {
      title: validatedData.title,
      description: validatedData.description ?? null,
      importance: validatedData.importance,
      progress: validatedData.progress ?? 0,
      startDate: parsedStartDate,
      deadline: parsedDeadline,
      groupId: validatedData.groupId ?? null,
      parentId: validatedData.parentId ?? null,
      userId,
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

    // Add labels from labelIds if provided
    if (validatedData.labelIds && validatedData.labelIds.length > 0) {
      for (const labelId of validatedData.labelIds) {
        // Verify label belongs to user
        const label = await prisma.label.findFirst({
          where: { id: labelId, userId },
        })
        if (label) {
          await prisma.taskLabel.create({
            data: {
              taskId: task.id,
              labelId,
            },
          }).catch(() => {
            // Ignore if already exists
          })
        }
      }
    }

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
