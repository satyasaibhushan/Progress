import { prisma } from "@/lib/prisma"

type TaskEdge = {
  id: string
  parentId: string | null
}

function buildChildrenMap(tasks: TaskEdge[]): Map<string, string[]> {
  const childrenByParentId = new Map<string, string[]>()

  for (const task of tasks) {
    if (!task.parentId) continue
    const existing = childrenByParentId.get(task.parentId) || []
    existing.push(task.id)
    childrenByParentId.set(task.parentId, existing)
  }

  return childrenByParentId
}

async function getDescendantTaskIds(taskId: string, userId: string): Promise<string[]> {
  const tasks = await prisma.task.findMany({
    where: { userId },
    select: {
      id: true,
      parentId: true,
    },
  })

  const childrenByParentId = buildChildrenMap(tasks)
  const descendants: string[] = []
  const queue = [...(childrenByParentId.get(taskId) || [])]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue
    descendants.push(currentId)

    const children = childrenByParentId.get(currentId)
    if (children && children.length > 0) {
      queue.push(...children)
    }
  }

  return descendants
}

export async function propagateLabelsToTaskDescendants(
  taskId: string,
  labelIds: string[],
  userId: string
): Promise<void> {
  const uniqueLabelIds = [...new Set(labelIds)]
  if (uniqueLabelIds.length === 0) return

  const descendantTaskIds = await getDescendantTaskIds(taskId, userId)

  if (descendantTaskIds.length > 0) {
    await prisma.taskLabel.createMany({
      data: descendantTaskIds.flatMap((childTaskId) =>
        uniqueLabelIds.map((labelId) => ({
          taskId: childTaskId,
          labelId,
        }))
      ),
      skipDuplicates: true,
    })
  }

  const taskIdsForLinkedHabits = [taskId, ...descendantTaskIds]
  const habits = await prisma.habit.findMany({
    where: {
      userId,
      parentTaskId: {
        in: taskIdsForLinkedHabits,
      },
    },
    select: {
      id: true,
    },
  })

  if (habits.length > 0) {
    await prisma.habitLabel.createMany({
      data: habits.flatMap((habit) =>
        uniqueLabelIds.map((labelId) => ({
          habitId: habit.id,
          labelId,
        }))
      ),
      skipDuplicates: true,
    })
  }
}

export async function propagateGroupToTaskDescendants(
  taskId: string,
  groupId: string | null,
  userId: string
): Promise<void> {
  const descendantTaskIds = await getDescendantTaskIds(taskId, userId)

  if (descendantTaskIds.length > 0) {
    await prisma.task.updateMany({
      where: {
        id: {
          in: descendantTaskIds,
        },
        userId,
      },
      data: {
        groupId,
      },
    })
  }

  const taskIdsForLinkedHabits = [taskId, ...descendantTaskIds]
  await prisma.habit.updateMany({
    where: {
      userId,
      parentTaskId: {
        in: taskIdsForLinkedHabits,
      },
    },
    data: {
      groupId,
    },
  })
}
