export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { serializeTask, serializeTasks } from "@/lib/utils"
import { getDateKeyInTimeZone, getUserTimezone } from "@/lib/user-timezone"
import { parseDateInputToUTCDate } from "@/lib/date-only"
import { normalizeCursorPagination, getPaginatedWindow } from "@/lib/server/pagination/cursor"
import { createTaskComparator } from "@/lib/server/ranking/task-ranking"
import {
  buildTaskTree,
  groupTasksByParentId,
  treeContainsTaskId,
  type TreeNode,
} from "@/lib/server/tree/task-tree"
import {
  attachHabitProgress,
  attachPeriodMetrics,
  loadLogsByHabitIds,
} from "@/lib/server/habits/log-metrics"
import { attachDerivedTaskProgress } from "@/lib/server/progress/apply"
import { reconcileUserProgress } from "@/lib/server/progress/reconcile"
import { reconcileUserLabelInheritance } from "@/lib/server/inheritance/labels"
import { getEffectiveTaskBounds } from "@/lib/server/inheritance/bounds"
import { reconcileUserGroupInheritance } from "@/lib/server/inheritance/groups"

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
  parentTaskId: string | null
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
        attachHabitProgress(allHabits, logsByHabitId)
        attachPeriodMetrics(allHabits, logsByHabitId, userTimeZone)
        attachDerivedTaskProgress(allTasks, allHabits)
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
      attachHabitProgress(allHabits, logsByHabitId)
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
    const userTimeZone = await getUserTimezone(userId)

    const body = await request.json()
    const validatedData = createTaskSchema.parse(body)
    const requestedGroupId = validatedData.groupId ?? null
    const requestedGroupIdInput = validatedData.groupId

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

    if (parsedStartDate && parsedDeadline && parsedStartDate > parsedDeadline) {
      return NextResponse.json(
        { error: "Task start date must be on or before its deadline" },
        { status: 400 }
      )
    }

    if (parsedDeadline) {
      const deadlineKey = parsedDeadline.toISOString().slice(0, 10)
      if (deadlineKey < getDateKeyInTimeZone(new Date(), userTimeZone)) {
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
          startDate: true,
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

      const parentBounds = await getEffectiveTaskBounds(parentTask.id, userId)

      if (parsedStartDate && parentBounds?.minStartDate && parsedStartDate < parentBounds.minStartDate) {
        return NextResponse.json(
          { error: "Child task start date must be on or after parent task start date" },
          { status: 400 }
        )
      }

      // Validate: child deadline must not be after parent deadline (if both have deadlines)
      if (parsedDeadline && parentBounds?.maxEndDate) {
        if (parsedDeadline > parentBounds.maxEndDate) {
          return NextResponse.json(
            { error: "Child task deadline must be on or before parent task deadline" },
            { status: 400 }
          )
        }
      }

      if (parsedStartDate && parentBounds?.maxEndDate && parsedStartDate > parentBounds.maxEndDate) {
        return NextResponse.json(
          { error: "Child task start date must be on or before its ancestor deadline" },
          { status: 400 }
        )
      }

      if (parsedDeadline && parentBounds?.minStartDate && parsedDeadline < parentBounds.minStartDate) {
        return NextResponse.json(
          { error: "Child task deadline must be on or after its ancestor start date" },
          { status: 400 }
        )
      }

      // A child inherits its parent's effective group.  Reject an explicit
      // conflicting group instead of silently replacing the user's input;
      // this mirrors the update endpoint and makes create/update semantics
      // consistent.
      if (
        parentTask.groupId !== null &&
        requestedGroupIdInput !== undefined &&
        requestedGroupIdInput !== parentTask.groupId
      ) {
        return NextResponse.json(
          {
            error: "Cannot change group. This task inherits its group from a parent task.",
            inheritedGroupId: parentTask.groupId,
          },
          { status: 400 }
        )
      }

      if (parentTask.groupId) {
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
      directGroupId: parentTask?.groupId ? null : requestedGroupId,
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
      const inheritedLabelIds = new Set(
        parentTask?.taskLabels.map((taskLabel) => taskLabel.labelId) || []
      )
      const directLabelIds = validatedData.labelIds.filter(
        (labelId) => !inheritedLabelIds.has(labelId)
      )
      for (const labelId of directLabelIds) {
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

    await reconcileUserGroupInheritance(userId)
    await reconcileUserLabelInheritance(userId)
    await reconcileUserProgress(userId)

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
