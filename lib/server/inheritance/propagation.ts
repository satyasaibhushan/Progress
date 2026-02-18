import { prisma } from "@/lib/prisma"

type TaskEdge = {
  id: string
  parentId: string | null
}

function isSameDate(left: Date | null, right: Date | null): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.getTime() === right.getTime()
}

function clampToDateBounds(
  currentStartDate: Date | null,
  currentEndDate: Date | null,
  minStartDate: Date | null,
  maxEndDate: Date | null
): { startDate: Date | null; endDate: Date | null; changed: boolean } {
  let nextStartDate = currentStartDate
  let nextEndDate = currentEndDate
  let startDateClamped = false
  let endDateClamped = false

  if (minStartDate && nextStartDate && nextStartDate < minStartDate) {
    nextStartDate = minStartDate
    startDateClamped = true
  }

  if (maxEndDate && nextEndDate && nextEndDate > maxEndDate) {
    nextEndDate = maxEndDate
    endDateClamped = true
  }

  // Keep the item internally valid only if this update actually clamped a bound.
  if (nextStartDate && nextEndDate && nextStartDate > nextEndDate && (startDateClamped || endDateClamped)) {
    if (maxEndDate && nextStartDate > maxEndDate) {
      nextStartDate = maxEndDate
      nextEndDate = maxEndDate
    } else {
      nextEndDate = nextStartDate
    }
  }

  const changed =
    !isSameDate(currentStartDate, nextStartDate) ||
    !isSameDate(currentEndDate, nextEndDate)

  return {
    startDate: nextStartDate,
    endDate: nextEndDate,
    changed,
  }
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

export async function propagateDateBoundsToTaskDescendants(
  taskId: string,
  bounds: {
    startDate: Date | null
    deadline: Date | null
  },
  userId: string
): Promise<{
  updatedTasks: number
  updatedHabits: number
}> {
  const { startDate: parentStartDate, deadline: parentDeadline } = bounds

  if (!parentStartDate && !parentDeadline) {
    return { updatedTasks: 0, updatedHabits: 0 }
  }

  const descendantTaskIds = await getDescendantTaskIds(taskId, userId)
  const taskIdsForLinkedHabits = [taskId, ...descendantTaskIds]

  const descendantTasks = descendantTaskIds.length > 0
    ? await prisma.task.findMany({
        where: {
          userId,
          id: {
            in: descendantTaskIds,
          },
        },
        select: {
          id: true,
          startDate: true,
          deadline: true,
        },
      })
    : []

  const linkedHabits = taskIdsForLinkedHabits.length > 0
    ? await prisma.habit.findMany({
        where: {
          userId,
          parentTaskId: {
            in: taskIdsForLinkedHabits,
          },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      })
    : []

  const taskUpdates = descendantTasks.flatMap((task) => {
    const clamped = clampToDateBounds(
      task.startDate,
      task.deadline,
      parentStartDate,
      parentDeadline
    )

    if (!clamped.changed) return []

    return [
      prisma.task.update({
        where: { id: task.id },
        data: {
          startDate: clamped.startDate,
          deadline: clamped.endDate,
        },
      }),
    ]
  })

  const habitUpdates = linkedHabits.flatMap((habit) => {
    const clamped = clampToDateBounds(
      habit.startDate,
      habit.endDate,
      parentStartDate,
      parentDeadline
    )

    if (!clamped.changed) return []

    return [
      prisma.habit.update({
        where: { id: habit.id },
        data: {
          startDate: clamped.startDate,
          endDate: clamped.endDate,
        },
      }),
    ]
  })

  if (taskUpdates.length > 0 || habitUpdates.length > 0) {
    await prisma.$transaction([...taskUpdates, ...habitUpdates])
  }

  return {
    updatedTasks: taskUpdates.length,
    updatedHabits: habitUpdates.length,
  }
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
