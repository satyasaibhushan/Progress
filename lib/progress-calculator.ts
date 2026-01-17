/**
 * Progress Calculation Engine
 *
 * This module provides utilities to calculate progress for tasks and goals
 * based on child tasks, importance weights, and linked habits.
 */

import { prisma } from './prisma';
import { HabitType } from './generated/prisma';

/**
 * Round a number to 2 decimal places
 * @param value - The number to round
 * @returns The rounded number
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate task progress from its child tasks weighted by importance
 *
 * Formula:
 * taskProgress = Σ(childTask.progress × childTask.importance) / Σ(childTask.importance)
 *
 * @param taskId - The ID of the task to calculate progress for
 * @returns The calculated progress (0-100) or null if no children exist
 */
export async function calculateTaskProgress(taskId: string): Promise<number | null> {
  // Fetch the task with its children
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      children: {
        select: {
          id: true,
          progress: true,
          importance: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  // If no children, return null (manual progress should be used)
  if (task.children.length === 0) {
    return null;
  }

  // Calculate weighted progress
  let totalWeightedProgress = 0;
  let totalImportance = 0;

  for (const child of task.children) {
    totalWeightedProgress += child.progress * child.importance;
    totalImportance += child.importance;
  }

  // Avoid division by zero (shouldn't happen if importance is validated to be >= 1)
  if (totalImportance === 0) {
    return 0;
  }

  const calculatedProgress = totalWeightedProgress / totalImportance;

  // Ensure the result is within 0-100 range and round to 2 decimal places
  return roundToTwoDecimals(Math.max(0, Math.min(100, calculatedProgress)));
}

/**
 * Calculate habit completion rate for today based on habit type
 *
 * @param habitId - The ID of the habit
 * @returns Completion percentage (0-100)
 */
export async function calculateHabitCompletionToday(habitId: string): Promise<number> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    include: {
      habitLogs: {
        where: {
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)), // Start of today
            lt: new Date(new Date().setHours(24, 0, 0, 0)),  // Start of tomorrow
          },
        },
      },
    },
  });

  if (!habit) {
    throw new Error(`Habit with ID ${habitId} not found`);
  }

  const todayLog = habit.habitLogs[0]; // Should be max 1 log per day

  switch (habit.type) {
    case HabitType.DAILY:
      // Completed if logged today
      return todayLog ? 100 : 0;

    case HabitType.N_PER_DAY:
      // Progress = (count / targetCount) × 100
      if (!habit.targetCount || habit.targetCount === 0) {
        return 0;
      }
      const count = todayLog?.count || 0;
      return roundToTwoDecimals(Math.min(100, (count / habit.targetCount) * 100));

    case HabitType.WEEKLY:
      // Check if logged at least once this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const weekLogs = await prisma.habitLog.count({
        where: {
          habitId: habitId,
          date: {
            gte: startOfWeek,
          },
        },
      });

      return weekLogs > 0 ? 100 : 0;

    case HabitType.MONTHLY:
      // Check if logged at least once this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthLogs = await prisma.habitLog.count({
        where: {
          habitId: habitId,
          date: {
            gte: startOfMonth,
          },
        },
      });

      return monthLogs > 0 ? 100 : 0;

    default:
      return 0;
  }
}

/**
 * Calculate overall habit completion rate for a list of habits
 * Weighted by importance of each habit
 *
 * @param habitIds - Array of habit IDs
 * @returns Weighted average completion percentage (0-100)
 */
export async function calculateHabitsCompletionRate(habitIds: string[]): Promise<number> {
  if (habitIds.length === 0) {
    return 0;
  }

  // Get habits with their importance
  const habits = await prisma.habit.findMany({
    where: {
      id: {
        in: habitIds,
      },
    },
    select: {
      id: true,
      importance: true,
    },
  });

  let totalWeightedCompletion = 0;
  let totalImportance = 0;

  for (const habit of habits) {
    const completion = await calculateHabitCompletionToday(habit.id);
    totalWeightedCompletion += completion * habit.importance;
    totalImportance += habit.importance;
  }

  // Avoid division by zero
  if (totalImportance === 0) {
    return 0;
  }

  return roundToTwoDecimals(totalWeightedCompletion / totalImportance);
}

/**
 * Calculate root task (goal) progress including child tasks and linked habits
 *
 * Formula (importance-weighted):
 * goalProgress = (Σ(childTask.progress × childTask.importance) + Σ(habitCompletion × habit.importance)) /
 *                (Σ(childTask.importance) + Σ(habit.importance))
 *
 * Where:
 * - childTask.progress: 0-100 percentage
 * - childTask.importance: 1-100 weightage
 * - habitCompletion: 0-100 percentage based on habit type
 * - habit.importance: 1-100 weightage
 *
 * @param taskId - The ID of the root task (goal)
 * @returns The calculated progress (0-100)
 */
export async function calculateGoalProgress(taskId: string): Promise<number> {
  // Fetch the task with children and linked habits
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      children: {
        select: {
          id: true,
          progress: true,
          importance: true,
        },
      },
      habits: {
        select: {
          id: true,
          importance: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  // Verify this is a root task (goal)
  if (task.parentId !== null) {
    throw new Error(`Task ${taskId} is not a root task (goal). Use calculateTaskProgress instead.`);
  }

  // If no children or habits, use manual progress
  if (task.children.length === 0 && task.habits.length === 0) {
    return roundToTwoDecimals(task.progress);
  }

  let totalWeightedProgress = 0;
  let totalImportance = 0;

  // Add weighted progress from child tasks
  for (const child of task.children) {
    totalWeightedProgress += child.progress * child.importance;
    totalImportance += child.importance;
  }

  // Add weighted completion from linked habits
  for (const habit of task.habits) {
    const habitCompletion = await calculateHabitCompletionToday(habit.id);
    totalWeightedProgress += habitCompletion * habit.importance;
    totalImportance += habit.importance;
  }

  // Avoid division by zero
  if (totalImportance === 0) {
    return roundToTwoDecimals(task.progress);
  }

  const goalProgress = totalWeightedProgress / totalImportance;
  return roundToTwoDecimals(Math.max(0, Math.min(100, goalProgress)));
}

/**
 * Recursively update progress for a task and all its ancestors
 *
 * @param taskId - The ID of the task to update
 * @returns The updated task with new progress
 */
export async function updateTaskProgressRecursive(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      parentId: true,
      children: true,
    },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  // Calculate progress based on whether it's a root task or not
  let newProgress: number;

  if (task.parentId === null) {
    // Root task (goal) - include habits in calculation
    newProgress = await calculateGoalProgress(taskId);
  } else {
    // Non-root task - only use child tasks
    const calculatedProgress = await calculateTaskProgress(taskId);

    // If no children (leaf task), keep manual progress
    if (calculatedProgress === null) {
      return; // Don't update leaf tasks automatically
    }

    newProgress = calculatedProgress;
  }

  // Update the task's progress
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: newProgress },
  });

  // Recursively update parent task if exists
  if (task.parentId) {
    await updateTaskProgressRecursive(task.parentId);
  }
}

/**
 * Update all root tasks (goals) progress for a specific user
 *
 * @param userId - The ID of the user
 */
export async function updateAllGoalsProgress(userId: string): Promise<void> {
  // Get all root tasks (goals) for the user
  const rootTasks = await prisma.task.findMany({
    where: {
      userId: userId,
      parentId: null,
    },
    select: {
      id: true,
    },
  });

  // Update each root task
  for (const task of rootTasks) {
    await updateTaskProgressRecursive(task.id);
  }
}

/**
 * Calculate progress for a specific label (on-demand)
 *
 * Progress is calculated as the importance-weighted average of all root tasks (goals)
 * and habits that have this label.
 *
 * @param labelId - The ID of the label
 * @returns Object containing overall progress, task progress, and habit completion rate
 */
export async function calculateLabelProgress(labelId: string): Promise<{
  overallProgress: number;
  taskProgress: number;
  habitCompletionRate: number;
  taskCount: number;
  habitCount: number;
}> {
  // Get all root tasks (goals) with this label
  const tasksWithLabel = await prisma.task.findMany({
    where: {
      parentId: null, // Only root tasks (goals)
      labels: {
        some: {
          labelId: labelId,
        },
      },
    },
    select: {
      id: true,
      progress: true,
      importance: true,
    },
  });

  // Get all habits with this label
  const habitsWithLabel = await prisma.habit.findMany({
    where: {
      labels: {
        some: {
          labelId: labelId,
        },
      },
    },
    select: {
      id: true,
      importance: true,
    },
  });

  // Calculate importance-weighted task progress
  let taskProgress = 0;
  let taskImportanceSum = 0;
  if (tasksWithLabel.length > 0) {
    for (const task of tasksWithLabel) {
      taskProgress += task.progress * task.importance;
      taskImportanceSum += task.importance;
    }
    if (taskImportanceSum > 0) {
      taskProgress = taskProgress / taskImportanceSum;
    }
  }

  // Calculate importance-weighted habit completion rate
  let habitCompletionRate = 0;
  if (habitsWithLabel.length > 0) {
    const habitIds = habitsWithLabel.map(h => h.id);
    habitCompletionRate = await calculateHabitsCompletionRate(habitIds);
  }

  // Calculate overall progress (importance-weighted)
  let overallProgress = 0;
  let totalWeightedProgress = 0;
  let totalImportance = 0;

  // Add weighted task progress
  for (const task of tasksWithLabel) {
    totalWeightedProgress += task.progress * task.importance;
    totalImportance += task.importance;
  }

  // Add weighted habit completion
  for (const habit of habitsWithLabel) {
    const habitCompletion = await calculateHabitCompletionToday(habit.id);
    totalWeightedProgress += habitCompletion * habit.importance;
    totalImportance += habit.importance;
  }

  if (totalImportance > 0) {
    overallProgress = totalWeightedProgress / totalImportance;
  }

  return {
    overallProgress: roundToTwoDecimals(Math.max(0, Math.min(100, overallProgress))),
    taskProgress: roundToTwoDecimals(Math.max(0, Math.min(100, taskProgress))),
    habitCompletionRate: roundToTwoDecimals(Math.max(0, Math.min(100, habitCompletionRate))),
    taskCount: tasksWithLabel.length,
    habitCount: habitsWithLabel.length,
  };
}

/**
 * Calculate progress for all labels of a specific user (on-demand)
 *
 * @param userId - The ID of the user
 * @returns Array of label progress data
 */
export async function calculateAllLabelsProgress(userId: string): Promise<Array<{
  labelId: string;
  labelName: string;
  labelColor: string | null;
  overallProgress: number;
  taskProgress: number;
  habitCompletionRate: number;
  taskCount: number;
  habitCount: number;
}>> {
  // Get all labels for the user
  const labels = await prisma.label.findMany({
    where: {
      userId: userId,
    },
    select: {
      id: true,
      name: true,
      color: true,
    },
  });

  // Calculate progress for each label
  const labelProgressData = await Promise.all(
    labels.map(async (label) => {
      const progress = await calculateLabelProgress(label.id);
      return {
        labelId: label.id,
        labelName: label.name,
        labelColor: label.color,
        ...progress,
      };
    })
  );

  return labelProgressData;
}

/**
 * Calculate progress for a specific group/category (on-demand)
 *
 * Progress is calculated as the importance-weighted average of all root tasks (goals)
 * and habits in this group.
 *
 * @param groupId - The ID of the group
 * @returns Object containing overall progress, task progress, and habit completion rate
 */
export async function calculateGroupProgress(groupId: string): Promise<{
  overallProgress: number;
  taskProgress: number;
  habitCompletionRate: number;
  taskCount: number;
  habitCount: number;
}> {
  // Get all root tasks (goals) in this group
  const tasksInGroup = await prisma.task.findMany({
    where: {
      parentId: null, // Only root tasks (goals)
      groupId: groupId,
    },
    select: {
      id: true,
      progress: true,
      importance: true,
    },
  });

  // Get all habits in this group
  const habitsInGroup = await prisma.habit.findMany({
    where: {
      groupId: groupId,
    },
    select: {
      id: true,
      importance: true,
    },
  });

  // Calculate importance-weighted task progress
  let taskProgress = 0;
  let taskImportanceSum = 0;
  if (tasksInGroup.length > 0) {
    for (const task of tasksInGroup) {
      taskProgress += task.progress * task.importance;
      taskImportanceSum += task.importance;
    }
    if (taskImportanceSum > 0) {
      taskProgress = taskProgress / taskImportanceSum;
    }
  }

  // Calculate importance-weighted habit completion rate
  let habitCompletionRate = 0;
  if (habitsInGroup.length > 0) {
    const habitIds = habitsInGroup.map(h => h.id);
    habitCompletionRate = await calculateHabitsCompletionRate(habitIds);
  }

  // Calculate overall progress (importance-weighted)
  let overallProgress = 0;
  let totalWeightedProgress = 0;
  let totalImportance = 0;

  // Add weighted task progress
  for (const task of tasksInGroup) {
    totalWeightedProgress += task.progress * task.importance;
    totalImportance += task.importance;
  }

  // Add weighted habit completion
  for (const habit of habitsInGroup) {
    const habitCompletion = await calculateHabitCompletionToday(habit.id);
    totalWeightedProgress += habitCompletion * habit.importance;
    totalImportance += habit.importance;
  }

  if (totalImportance > 0) {
    overallProgress = totalWeightedProgress / totalImportance;
  }

  return {
    overallProgress: roundToTwoDecimals(Math.max(0, Math.min(100, overallProgress))),
    taskProgress: roundToTwoDecimals(Math.max(0, Math.min(100, taskProgress))),
    habitCompletionRate: roundToTwoDecimals(Math.max(0, Math.min(100, habitCompletionRate))),
    taskCount: tasksInGroup.length,
    habitCount: habitsInGroup.length,
  };
}
