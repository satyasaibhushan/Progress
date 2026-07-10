export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { getSuggestion, getSuggestions } from "@/lib/suggestion-algorithm"
import { prisma } from "@/lib/prisma"
import { parseStrictIntegerParam } from "@/lib/server/pagination/cursor"
import { resolveRootGoal, type AncestorTask } from "@/lib/suggestion-context"

type SuggestionBase = {
  id: string
  type: "task" | "habit"
  title: string
  description?: string | null
  progress: number
  expectedProgress: number
  progressGap: number
  importance: number
  score: number
  deadline?: Date | null
  endDate?: Date | null
  groupId?: string | null
  parentId?: string | null
  parentTaskId?: string | null
}

type EnrichedSuggestion = {
  id: string
  type: string
  title: string
  description?: string | null
  progress: number
  expectedProgress: number
  progressGap: number
  importance: number
  score: number
  deadline?: Date | null
  endDate?: Date | null
  group?: { id: string; name: string; color: string | null } | null
  parent?: { id: string; title: string; progress?: number | null }
  rootGoal?: { id: string; title: string }
  labels?: Array<{ id: string; name: string; color: string | null }>
}

// GET /api/suggestions - Get suggestion(s) for the authenticated user
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const requestedLimit = parseStrictIntegerParam(searchParams.get("limit") ?? "1")
    if (requestedLimit === null || requestedLimit <= 0) {
      return NextResponse.json(
        { error: "Invalid limit. Expected a positive integer." },
        { status: 400 }
      )
    }
    const limit = Math.min(20, requestedLimit)
    const randomize = searchParams.get("randomize") !== "false" // Default: true

    const items = limit === 1
      ? await getSuggestion(userId, randomize).then((item) => (item ? [item] : []))
      : await getSuggestions(userId, limit, randomize)

    if (items.length === 0) {
      return NextResponse.json({ data: limit === 1 ? null : [] })
    }

    const typedItems = items as SuggestionBase[]
    const groupIds = [...new Set(typedItems.map((item) => item.groupId).filter((groupId): groupId is string => Boolean(groupId)))]
    const taskSuggestionIds = typedItems.filter((item) => item.type === "task").map((item) => item.id)
    const habitSuggestionIds = typedItems.filter((item) => item.type === "habit").map((item) => item.id)

    const [groups, taskDetails, habitDetails] = await Promise.all([
      groupIds.length > 0
        ? prisma.group.findMany({
            where: {
              id: { in: groupIds },
              userId,
            },
            select: { id: true, name: true, color: true },
          })
        : Promise.resolve([]),
      taskSuggestionIds.length > 0
        ? prisma.task.findMany({
            where: {
              id: { in: taskSuggestionIds },
              userId,
            },
            include: {
              taskLabels: {
                include: {
                  label: true,
                },
              },
              parent: {
                select: {
                  id: true,
                  title: true,
                  progress: true,
                  parentId: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      habitSuggestionIds.length > 0
        ? prisma.habit.findMany({
            where: {
              id: { in: habitSuggestionIds },
              userId,
            },
            include: {
              habitLabels: {
                include: {
                  label: true,
                },
              },
              parentTask: {
                select: {
                  id: true,
                  title: true,
                  parentId: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ])

    const groupById = new Map(groups.map((group) => [group.id, group]))
    const taskById = new Map(taskDetails.map((task) => [task.id, task]))
    const habitById = new Map(habitDetails.map((habit) => [habit.id, habit]))

    const ancestorTaskById = new Map<string, AncestorTask>()
    for (const task of taskDetails) {
      ancestorTaskById.set(task.id, {
        id: task.id,
        title: task.title,
        parentId: task.parentId,
      })
      if (task.parent) {
        ancestorTaskById.set(task.parent.id, {
          id: task.parent.id,
          title: task.parent.title,
          parentId: task.parent.parentId,
        })
      }
    }

    for (const habit of habitDetails) {
      if (habit.parentTask) {
        ancestorTaskById.set(habit.parentTask.id, {
          id: habit.parentTask.id,
          title: habit.parentTask.title,
          parentId: habit.parentTask.parentId,
        })
      }
    }

    const pendingAncestorIds = new Set<string>()
    for (const ancestor of ancestorTaskById.values()) {
      if (ancestor.parentId && !ancestorTaskById.has(ancestor.parentId)) {
        pendingAncestorIds.add(ancestor.parentId)
      }
    }

    while (pendingAncestorIds.size > 0) {
      const idsToFetch = [...pendingAncestorIds].filter((candidateId) => !ancestorTaskById.has(candidateId))
      pendingAncestorIds.clear()
      if (idsToFetch.length === 0) break

      const ancestors = await prisma.task.findMany({
        where: {
          id: { in: idsToFetch },
          userId,
        },
        select: {
          id: true,
          title: true,
          parentId: true,
        },
      })

      for (const ancestor of ancestors) {
        ancestorTaskById.set(ancestor.id, ancestor)
        if (ancestor.parentId && !ancestorTaskById.has(ancestor.parentId)) {
          pendingAncestorIds.add(ancestor.parentId)
        }
      }
    }

    const enrichedItems: EnrichedSuggestion[] = typedItems.map((item) => {
      const enriched: EnrichedSuggestion = {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        progress: item.progress,
        expectedProgress: item.expectedProgress,
        progressGap: item.progressGap,
        importance: item.importance,
        score: item.score,
        deadline: item.deadline,
        endDate: item.endDate,
      }

      if (item.groupId) {
        enriched.group = groupById.get(item.groupId) || null
      }

      if (item.type === "task") {
        const task = taskById.get(item.id)
        if (task) {
          enriched.labels = task.taskLabels.map((taskLabel) => ({
            id: taskLabel.label.id,
            name: taskLabel.label.name,
            color: taskLabel.label.color,
          }))

          if (task.parent) {
            enriched.parent = {
              id: task.parent.id,
              title: task.parent.title,
              progress: task.parent.progress,
            }

            const rootTask = resolveRootGoal(task.parent.id, ancestorTaskById)
            if (rootTask && rootTask.id !== task.parent.id) {
              enriched.rootGoal = rootTask
            }
          }
        }
      } else {
        const habit = habitById.get(item.id)
        if (habit) {
          enriched.labels = habit.habitLabels.map((habitLabel) => ({
            id: habitLabel.label.id,
            name: habitLabel.label.name,
            color: habitLabel.label.color,
          }))

          if (habit.parentTask) {
            enriched.parent = {
              id: habit.parentTask.id,
              title: habit.parentTask.title,
            }

            const rootTask = resolveRootGoal(habit.parentTask.id, ancestorTaskById)
            if (rootTask && rootTask.id !== habit.parentTask.id) {
              enriched.rootGoal = rootTask
            }
          }
        }
      }

      return enriched
    })

    return NextResponse.json({
      data: limit === 1 ? enrichedItems[0] : enrichedItems,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
