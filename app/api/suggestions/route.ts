import { NextResponse } from "next/server"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { getSuggestion, getSuggestions } from "@/lib/suggestion-algorithm"
import { prisma } from "@/lib/prisma"

// GET /api/suggestions - Get suggestion(s) for the authenticated user
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { searchParams } = new URL(request.url)

    const limit = parseInt(searchParams.get("limit") || "1", 10)
    const randomize = searchParams.get("randomize") !== "false" // Default: true

    // Get suggestion(s)
    const items = limit === 1
      ? await getSuggestion(userId, randomize).then(item => item ? [item] : [])
      : await getSuggestions(userId, limit, randomize)

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No suggestions available. All items are completed or don't have deadlines." },
        { status: 404 }
      )
    }

    // Enrich items with context (parent, root goal, group, labels)
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const enriched: {
          id: string
          type: string
          title: string
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
        } = {
          id: item.id,
          type: item.type,
          title: item.title,
          progress: item.progress,
          expectedProgress: item.expectedProgress,
          progressGap: item.progressGap,
          importance: item.importance,
          score: item.score,
          deadline: item.deadline,
          endDate: item.endDate,
        }

        // Get group if exists
        if (item.groupId) {
          const group = await prisma.group.findUnique({
            where: { id: item.groupId },
            select: { id: true, name: true, color: true },
          })
          enriched.group = group
        }

        // Get labels
        if (item.type === "task") {
          const task = await prisma.task.findUnique({
            where: { id: item.id },
            include: {
              taskLabels: {
                include: { label: true },
              },
              parent: {
                select: { id: true, title: true, progress: true },
              },
            },
          })

          if (task) {
            enriched.labels = task.taskLabels.map((tl) => ({
              id: tl.label.id,
              name: tl.label.name,
              color: tl.label.color,
            }))

            // Get parent task
            if (task.parent) {
              enriched.parent = {
                id: task.parent.id,
                title: task.parent.title,
                progress: task.parent.progress,
              }

            // Get root goal (traverse up to root)
            let currentParentId = task.parentId
            let rootTask: { id: string; title: string } | null = task.parent

            while (currentParentId) {
              const parent = await prisma.task.findUnique({
                where: { id: currentParentId },
                select: { id: true, title: true, parentId: true },
              })

              if (parent) {
                rootTask = {
                  id: parent.id,
                  title: parent.title,
                }
                currentParentId = parent.parentId
              } else {
                break
              }
            }

            if (rootTask && rootTask.id !== task.parent.id) {
              enriched.rootGoal = {
                id: rootTask.id,
                title: rootTask.title,
              }
            }
            }
          }
        } else {
          // Habit
          const habit = await prisma.habit.findUnique({
            where: { id: item.id },
            include: {
              habitLabels: {
                include: { label: true },
              },
              parentTask: {
                select: { id: true, title: true },
              },
            },
          })

          if (habit) {
            enriched.labels = habit.habitLabels.map((hl) => ({
              id: hl.label.id,
              name: hl.label.name,
              color: hl.label.color,
            }))

            // Get parent task
            if (habit.parentTask) {
              enriched.parent = {
                id: habit.parentTask.id,
                title: habit.parentTask.title,
              }

              // Get root goal (traverse up to root)
              let currentTaskId = habit.parentTaskId
              let rootTask = habit.parentTask

              while (currentTaskId) {
                const parent = await prisma.task.findUnique({
                  where: { id: currentTaskId },
                  select: { id: true, title: true, parentId: true },
                })

                if (parent) {
                  rootTask = {
                    id: parent.id,
                    title: parent.title,
                  }
                  currentTaskId = parent.parentId
                } else {
                  break
                }
              }

              if (rootTask && rootTask.id !== habit.parentTask.id) {
                enriched.rootGoal = {
                  id: rootTask.id,
                  title: rootTask.title,
                }
              }
            }
          }
        }

        return enriched
      })
    )

    return NextResponse.json({
      data: limit === 1 ? enrichedItems[0] : enrichedItems,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
