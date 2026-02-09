import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTaskSchema } from "@/lib/validations/task"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueTaskTitle } from "@/lib/validations/uniqueness"
import { addChildToTask } from "@/lib/progress-calculator"
import { serializeTask, serializeTasks } from "@/lib/utils"
import { calculateIdealProgress, isPending } from "@/lib/date-helpers"
import {
  getInheritedLabelsFromTask,
} from "@/lib/inheritance-helpers"

// GET /api/tasks - Get all tasks for the authenticated user with optional filters
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const clampProgress = (value: number): number => {
      if (!Number.isFinite(value)) return 0
      return Math.min(100, Math.max(0, value))
    }

    const getDateValue = (value: Date | string | null | undefined, fallback: number): number => {
      if (!value) return fallback
      const date = new Date(value)
      const time = date.getTime()
      return Number.isNaN(time) ? fallback : time
    }

    const getTaskProgress = (task: any): number => {
      const hasChildren = typeof task._count?.children === "number"
        ? task._count.children > 0
        : Array.isArray(task.children) && task.children.length > 0
      const hasHabits = typeof task._count?.habits === "number"
        ? task._count.habits > 0
        : Array.isArray(task.habits) && task.habits.length > 0

      if (!hasChildren && !hasHabits) {
        return clampProgress(task.progress || 0)
      }

      if (task.total_weight !== null && task.total_weight !== undefined && task.weighted_progress !== null && task.weighted_progress !== undefined) {
        const totalWeight = Number(task.total_weight)
        const weightedProgress = Number(task.weighted_progress)
        if (Number.isFinite(totalWeight) && totalWeight > 0) {
          return clampProgress(weightedProgress / totalWeight)
        }
      }

      return clampProgress(task.progress || 0)
    }

    const getTaskScore = (task: any, progress: number): number => {
      const startDate = task.startDate || task.createdAt || null
      const expectedProgress = calculateIdealProgress(startDate, task.deadline) ?? 0
      const progressGap = Math.max(0, expectedProgress - progress)
      return progressGap * (task.importance || 0)
    }

    const isTaskOverdue = (task: any, progress: number): boolean => {
      if (progress >= 100) return false
      if (!task.deadline) return false
      const deadline = new Date(task.deadline)
      deadline.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return deadline < today
    }

    // Optional filters
    const parentId = searchParams.get("parentId")
    const groupId = searchParams.get("groupId")
    const includeChildren = searchParams.get("include") === "children"
    const includeHabits = searchParams.get("includeHabits") !== "false"
    const status = searchParams.get("status")
    const paginate = searchParams.get("paginate") === "true"
    const limitParam = Number.parseInt(searchParams.get("limit") || "20", 10)
    const cursorParam = Number.parseInt(searchParams.get("cursor") || "0", 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20
    const cursor = Number.isFinite(cursorParam) ? Math.max(cursorParam, 0) : 0
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

      if (includeHabits) {
        const childrenByParentId = new Map<string, typeof allTasks>()
        for (const task of allTasks) {
          if (!task.parentId) continue
          const siblings = childrenByParentId.get(task.parentId) || []
          siblings.push(task)
          childrenByParentId.set(task.parentId, siblings)
        }

        const allHabits = allTasks.flatMap((task) => task.habits || [])
        const uniqueHabitIds = [...new Set(allHabits.map((habit) => habit.id))]
        const habitLogSums = uniqueHabitIds.length > 0
          ? await prisma.habitLog.groupBy({
              by: ["habitId"],
              where: {
                habitId: {
                  in: uniqueHabitIds,
                },
              },
              _sum: {
                count: true,
              },
            })
          : []
        const habitLogCountByHabitId = new Map<string, number>(
          habitLogSums.map((entry) => [entry.habitId, entry._sum.count || 0])
        )
        const habitProgressByHabitId = new Map<string, number>()
        for (const habit of allHabits) {
          if (habitProgressByHabitId.has(habit.id)) continue
          const totalCount = habitLogCountByHabitId.get(habit.id) || 0
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
        const computeTaskContribution = (task: any): TaskContribution => {
          const cached = contributionMemo.get(task.id)
          if (cached) return cached

          const directChildren = childrenByParentId.get(task.id) || []
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
          const directChildren = childrenByParentId.get(task.id) || []
          const linkedHabits = task.habits || []
          if (directChildren.length === 0 && linkedHabits.length === 0) continue

          const contribution = computeTaskContribution(task)
          task.total_weight = BigInt(contribution.totalWeight)
          task.weighted_progress = BigInt(contribution.weightedProgress)
          task.progress = contribution.progress
        }
      }

      const taskMeta = new Map<string, {
        rank: number
        progress: number
        overdue: boolean
        score: number
        startTime: number
        deadlineTime: number
        updatedTime: number
      }>()

      const getMeta = (task: any) => {
        const cached = taskMeta.get(task.id)
        if (cached) return cached
        const progress = getTaskProgress(task)
        const completed = progress >= 100
        const rank = completed ? 2 : (isPending(task.startDate) ? 1 : 0)
        const overdue = isTaskOverdue(task, progress)
        const score = getTaskScore(task, progress)
        const meta = {
          rank,
          progress,
          overdue,
          score,
          startTime: getDateValue(task.startDate, Number.POSITIVE_INFINITY),
          deadlineTime: getDateValue(task.deadline, Number.POSITIVE_INFINITY),
          updatedTime: getDateValue(task.updatedAt, 0),
        }
        taskMeta.set(task.id, meta)
        return meta
      }

      const compareTasks = (a: any, b: any) => {
        const metaA = getMeta(a)
        const metaB = getMeta(b)
        if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank

        if (metaA.rank === 0) {
          if (metaA.overdue !== metaB.overdue) return metaA.overdue ? -1 : 1
          if (metaA.overdue && metaB.overdue) {
            const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
            if (deadlineDiff !== 0) return deadlineDiff
          }
          const scoreDiff = metaB.score - metaA.score
          if (scoreDiff !== 0) return scoreDiff
          if (!metaA.overdue && !metaB.overdue) {
            const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
            if (deadlineDiff !== 0) return deadlineDiff
          }
        } else if (metaA.rank === 1) {
          const startDiff = metaA.startTime - metaB.startTime
          if (startDiff !== 0) return startDiff
        } else {
          const updatedDiff = metaB.updatedTime - metaA.updatedTime
          if (updatedDiff !== 0) return updatedDiff
        }

        return metaB.updatedTime - metaA.updatedTime
      }

      allTasks.sort(compareTasks)

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
          const pagedRootTasks = filteredRootTasks.slice(cursor, cursor + limit)
          const nextCursor = cursor + limit < filteredRootTasks.length
            ? String(cursor + limit)
            : null

          return NextResponse.json({
            data: serializeTasks(pagedRootTasks),
            pageInfo: {
              nextCursor,
              hasMore: nextCursor !== null,
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

    const taskMeta = new Map<string, {
      rank: number
      progress: number
      overdue: boolean
      score: number
      startTime: number
      deadlineTime: number
      updatedTime: number
    }>()

    const getMeta = (task: any) => {
      const cached = taskMeta.get(task.id)
      if (cached) return cached
      const progress = getTaskProgress(task)
      const completed = progress >= 100
      const rank = completed ? 2 : (isPending(task.startDate) ? 1 : 0)
      const overdue = isTaskOverdue(task, progress)
      const score = getTaskScore(task, progress)
      const meta = {
        rank,
        progress,
        overdue,
        score,
        startTime: getDateValue(task.startDate, Number.POSITIVE_INFINITY),
        deadlineTime: getDateValue(task.deadline, Number.POSITIVE_INFINITY),
        updatedTime: getDateValue(task.updatedAt, 0),
      }
      taskMeta.set(task.id, meta)
      return meta
    }

    const compareTasks = (a: any, b: any) => {
      const metaA = getMeta(a)
      const metaB = getMeta(b)
      if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank

      if (metaA.rank === 0) {
        if (metaA.overdue !== metaB.overdue) return metaA.overdue ? -1 : 1
        if (metaA.overdue && metaB.overdue) {
          const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
          if (deadlineDiff !== 0) return deadlineDiff
        }
        const scoreDiff = metaB.score - metaA.score
        if (scoreDiff !== 0) return scoreDiff
        if (!metaA.overdue && !metaB.overdue) {
          const deadlineDiff = metaA.deadlineTime - metaB.deadlineTime
          if (deadlineDiff !== 0) return deadlineDiff
        }
      } else if (metaA.rank === 1) {
        const startDiff = metaA.startTime - metaB.startTime
        if (startDiff !== 0) return startDiff
      } else {
        const updatedDiff = metaB.updatedTime - metaA.updatedTime
        if (updatedDiff !== 0) return updatedDiff
      }

      return metaB.updatedTime - metaA.updatedTime
    }

    tasks.sort(compareTasks)

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
        const pagedTasks = filteredTasks.slice(cursor, cursor + limit)
        const nextCursor = cursor + limit < filteredTasks.length
          ? String(cursor + limit)
          : null
        return NextResponse.json({
          data: serializeTasks(pagedTasks),
          pageInfo: {
            nextCursor,
            hasMore: nextCursor !== null,
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
    if (validatedData.deadline) {
      const deadline = new Date(validatedData.deadline)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      deadline.setHours(0, 0, 0, 0)

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

    // Convert startDate and deadline strings to Date if provided
    const taskData = {
      title: validatedData.title,
      description: validatedData.description ?? null,
      importance: validatedData.importance,
      progress: validatedData.progress ?? 0,
      startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
      deadline: validatedData.deadline ? new Date(validatedData.deadline) : null,
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
