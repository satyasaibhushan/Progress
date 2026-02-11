import { prisma } from "@/lib/prisma"
import {
  propagateGroupToTaskDescendants,
  propagateLabelsToTaskDescendants,
} from "@/lib/server/inheritance/propagation"

/**
 * Get all labels from a task's parent chain (ancestors)
 * Returns an array of label IDs that are inherited from parent tasks
 */
export async function getInheritedLabelsFromTask(
  taskId: string,
  userId: string
): Promise<string[]> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      taskLabels: {
        select: { labelId: true },
      },
      parent: {
        include: {
          taskLabels: {
            select: { labelId: true },
          },
        },
      },
    },
  })

  if (!task || !task.parent) {
    return []
  }

  // Get all labels from parent and its ancestors recursively
  const parentLabels = task.parent.taskLabels.map((tl) => tl.labelId)
  const ancestorLabels = await getInheritedLabelsFromTask(task.parent.id, userId)
  
  // Combine and deduplicate
  return [...new Set([...parentLabels, ...ancestorLabels])]
}

/**
 * Get the group ID from a task's parent chain (ancestors)
 * Returns the groupId if any ancestor has a group
 */
export async function getInheritedGroupFromTask(
  taskId: string,
  userId: string
): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      parentId: true,
      parent: {
        select: {
          id: true,
          groupId: true,
          parentId: true,
        },
      },
    },
  })

  if (!task || !task.parent) {
    return null
  }

  // If parent has a group, return it
  if (task.parent.groupId) {
    return task.parent.groupId
  }

  // Otherwise, check ancestors
  return getInheritedGroupFromTask(task.parent.id, userId)
}

/**
 * Get all labels from a habit's parent task chain
 */
export async function getInheritedLabelsFromHabit(
  habitId: string,
  userId: string
): Promise<string[]> {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    include: {
      parentTask: {
        include: {
          taskLabels: {
            select: { labelId: true },
          },
        },
      },
    },
  })

  if (!habit || !habit.parentTask) {
    return []
  }

  // Get all labels from parent task and its ancestors
  const parentLabels = habit.parentTask.taskLabels.map((tl) => tl.labelId)
  const ancestorLabels = await getInheritedLabelsFromTask(habit.parentTask.id, userId)
  
  // Combine and deduplicate
  return [...new Set([...parentLabels, ...ancestorLabels])]
}

/**
 * Get the group ID from a habit's parent task chain
 */
export async function getInheritedGroupFromHabit(
  habitId: string,
  userId: string
): Promise<string | null> {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    include: {
      parentTask: {
        select: {
          id: true,
          groupId: true,
        },
      },
    },
  })

  if (!habit || !habit.parentTask) {
    return null
  }

  // If parent task has a group, return it
  if (habit.parentTask.groupId) {
    return habit.parentTask.groupId
  }

  // Otherwise, check ancestors
  return getInheritedGroupFromTask(habit.parentTask.id, userId)
}

/**
 * Propagate labels from a task to all its children (recursively)
 * This ensures all sub-tasks have the parent's labels
 */
export async function propagateLabelsToChildren(
  taskId: string,
  labelIds: string[],
  userId: string
): Promise<void> {
  await propagateLabelsToTaskDescendants(taskId, labelIds, userId)
}

/**
 * Propagate group from a task to all its children (recursively)
 * This ensures all sub-tasks and linked habits have the parent's group
 */
export async function propagateGroupToChildren(
  taskId: string,
  groupId: string | null,
  userId: string
): Promise<void> {
  await propagateGroupToTaskDescendants(taskId, groupId, userId)
}

/**
 * Check if a label can be removed from a task
 * Returns false if the label is inherited from a parent task
 */
export async function canRemoveLabelFromTask(
  taskId: string,
  labelId: string,
  userId: string
): Promise<boolean> {
  const inheritedLabels = await getInheritedLabelsFromTask(taskId, userId)
  return !inheritedLabels.includes(labelId)
}

/**
 * Check if a label can be removed from a habit
 * Returns false if the label is inherited from a parent task
 */
export async function canRemoveLabelFromHabit(
  habitId: string,
  labelId: string,
  userId: string
): Promise<boolean> {
  const inheritedLabels = await getInheritedLabelsFromHabit(habitId, userId)
  return !inheritedLabels.includes(labelId)
}

/**
 * Check if a task's group can be changed
 * Returns false if the task has a parent with a group
 */
export async function canChangeTaskGroup(
  taskId: string,
  userId: string
): Promise<boolean> {
  const inheritedGroup = await getInheritedGroupFromTask(taskId, userId)
  return inheritedGroup === null
}

/**
 * Check if a habit's group can be changed
 * Returns false if the habit has a parent task with a group
 */
export async function canChangeHabitGroup(
  habitId: string,
  userId: string
): Promise<boolean> {
  const inheritedGroup = await getInheritedGroupFromHabit(habitId, userId)
  return inheritedGroup === null
}
