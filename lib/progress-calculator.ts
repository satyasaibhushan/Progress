/**
 * Progress Calculation Engine (Aggregate-based)
 *
 * This module implements a bottom-up aggregate approach for progress calculation.
 *
 * Design:
 * - Leaf tasks/habits store: weight (importance), progress (user-entered or calculated)
 * - Parent tasks store: total_weight, weighted_progress (aggregates from descendants)
 * - Progress calculated on-demand: weighted_progress / total_weight
 */

import { prisma } from './prisma';

/**
 * Round a number to 2 decimal places
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate habit progress percentage from current and target counts.
 */
export function calculateHabitProgressFromCount(currentCount: number, targetCount: number): number {
  if (!targetCount || targetCount <= 0) {
    return 0;
  }
  const progress = (currentCount / targetCount) * 100;
  return roundToTwoDecimals(Math.min(100, Math.max(0, progress)));
}

/**
 * Calculate habit completion rate (cumulative progress)
 * Progress = (total count of all logs / targetCount) × 100
 *
 * @param habitId - The ID of the habit
 * @returns Completion percentage (0-100)
 */
export async function calculateHabitCompletion(habitId: string): Promise<number> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: {
      id: true,
      targetCount: true,
      currentCount: true,
    },
  });

  if (!habit) {
    throw new Error(`Habit with ID ${habitId} not found`);
  }

  return calculateHabitProgressFromCount(habit.currentCount || 0, habit.targetCount || 0);
}

/**
 * @deprecated Use calculateHabitCompletion instead
 * Kept for backward compatibility during migration
 */
export async function calculateHabitCompletionToday(habitId: string): Promise<number> {
  return calculateHabitCompletion(habitId);
}

/**
 * Get progress for a task (on-demand calculation)
 *
 * For leaf tasks: Returns stored progress field
 * For parent tasks: Calculates from weighted_progress / total_weight
 *
 * @param taskId - The ID of the task
 * @returns Progress percentage (0-100)
 */
export async function getTaskProgress(taskId: string): Promise<number> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      progress: true,
      total_weight: true,
      weighted_progress: true,
      _count: {
        select: {
          children: true,
          habits: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  const isLeaf = task._count.children === 0 && task._count.habits === 0;

  if (isLeaf) {
    // Leaf task - return stored progress
    return roundToTwoDecimals(task.progress || 0);
  }

  // Parent task - calculate from aggregates
  if (!task.total_weight || task.total_weight === BigInt(0)) {
    return 0;
  }

  const progress = Number(task.weighted_progress || BigInt(0)) / Number(task.total_weight);
  return roundToTwoDecimals(Math.max(0, Math.min(100, progress)));
}

/**
 * Propagate aggregate changes up the ancestor chain
 *
 * @param taskId - Starting task ID
 * @param weightDelta - Change in total_weight
 * @param weightedProgressDelta - Change in weighted_progress
 */
async function propagateAggregates(
  taskId: string,
  weightDelta: bigint,
  weightedProgressDelta: bigint
): Promise<void> {
  if (weightDelta === BigInt(0) && weightedProgressDelta === BigInt(0)) {
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { parentId: true, total_weight: true, weighted_progress: true },
  });

  if (!task) return;

  // Update current task's aggregates
  await prisma.task.update({
    where: { id: taskId },
    data: {
      total_weight: (task.total_weight || BigInt(0)) + weightDelta,
      weighted_progress: (task.weighted_progress || BigInt(0)) + weightedProgressDelta,
    },
  });

  // Recursively propagate to parent
  if (task.parentId) {
    await propagateAggregates(task.parentId, weightDelta, weightedProgressDelta);
  }
}

/**
 * Update aggregates when a leaf task's progress changes
 *
 * @param taskId - The leaf task ID
 * @param oldProgress - Previous progress value
 * @param newProgress - New progress value
 * @param weight - Task's weight (importance)
 */
export async function updateLeafTaskProgress(
  taskId: string,
  oldProgress: number,
  newProgress: number,
  weight: number
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { parentId: true },
  });

  if (!task || !task.parentId) return;

  const weightedProgressDelta = BigInt(Math.round((newProgress - oldProgress) * weight));

  await propagateAggregates(task.parentId, BigInt(0), weightedProgressDelta);
}

/**
 * Update aggregates when a leaf task's importance (weight) changes
 *
 * @param taskId - The leaf task ID
 * @param oldWeight - Previous weight value
 * @param newWeight - New weight value
 * @param currentProgress - Current progress value
 */
export async function updateLeafTaskWeight(
  taskId: string,
  oldWeight: number,
  newWeight: number,
  currentProgress: number
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { parentId: true },
  });

  if (!task || !task.parentId) return;

  const weightDelta = BigInt(newWeight - oldWeight);
  const weightedProgressDelta = BigInt(Math.round(currentProgress * (newWeight - oldWeight)));

  await propagateAggregates(task.parentId, weightDelta, weightedProgressDelta);
}

/**
 * Handle adding a child to a task (potentially leaf → parent transition)
 *
 * @param parentId - Parent task ID
 * @param childWeight - Child's total weight
 * @param childWeightedProgress - Child's weighted progress
 */
export async function addChildToTask(
  parentId: string,
  childWeight: bigint,
  childWeightedProgress: bigint
): Promise<void> {
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: {
      total_weight: true,
      weighted_progress: true,
      _count: {
        select: { children: true, habits: true },
      },
    },
  });

  if (!parent) return;

  // If parent has no aggregates set yet (was a leaf before this child was added)
  if (parent.total_weight === null && parent.weighted_progress === null) {
    // This is the first child, initialize aggregates
    await prisma.task.update({
      where: { id: parentId },
      data: {
        total_weight: childWeight,
        weighted_progress: childWeightedProgress,
      },
    });
    // If parent has a parent, propagate the change up
    const parentTask = await prisma.task.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (parentTask?.parentId) {
      await propagateAggregates(parentTask.parentId, childWeight, childWeightedProgress);
    }
  } else {
    // Parent already has aggregates, add this child's contribution
    // propagateAggregates will update this parent and propagate up the tree
    const currentTotalWeight = parent.total_weight || BigInt(0);
    const currentWeightedProgress = parent.weighted_progress || BigInt(0);
    
    await prisma.task.update({
      where: { id: parentId },
      data: {
        total_weight: currentTotalWeight + childWeight,
        weighted_progress: currentWeightedProgress + childWeightedProgress,
      },
    });
    
    // Propagate to parent's parent if exists
    const parentTask = await prisma.task.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (parentTask?.parentId) {
      await propagateAggregates(parentTask.parentId, childWeight, childWeightedProgress);
    }
  }
}

/**
 * Handle removing a child from a task (potentially parent → leaf transition)
 *
 * @param parentId - Parent task ID
 * @param childWeight - Child's total weight
 * @param childWeightedProgress - Child's weighted progress
 */
export async function removeChildFromTask(
  parentId: string,
  childWeight: bigint,
  childWeightedProgress: bigint
): Promise<void> {
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: {
      total_weight: true,
      weighted_progress: true,
      _count: {
        select: { children: true, habits: true },
      },
    },
  });

  if (!parent) return;

  // If this was the last child (parent → leaf transition)
  if (parent._count.children === 1 && parent._count.habits === 0) {
    await prisma.task.update({
      where: { id: parentId },
      data: {
        total_weight: null,
        weighted_progress: null,
      },
    });
  } else {
    // Still has other children, subtract from aggregates
    await propagateAggregates(parentId, -childWeight, -childWeightedProgress);
  }
}

/**
 * Calculate initial aggregates for a task when it's created
 *
 * @param taskId - The task ID
 * @returns Object with total_weight and weighted_progress
 */
export async function calculateTaskAggregates(taskId: string): Promise<{
  total_weight: bigint;
  weighted_progress: bigint;
}> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      children: {
        select: {
          id: true,
          importance: true,
          progress: true,
          total_weight: true,
          weighted_progress: true,
          _count: {
            select: { children: true, habits: true },
          },
        },
      },
      habits: {
        select: {
          id: true,
          importance: true,
          targetCount: true,
          currentCount: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  let totalWeight = BigInt(0);
  let weightedProgress = BigInt(0);

  // Add contributions from child tasks
  for (const child of task.children) {
    const isLeaf = child._count.children === 0 && child._count.habits === 0;

    if (isLeaf) {
      // Leaf task contributes its weight and progress
      totalWeight += BigInt(child.importance);
      weightedProgress += BigInt(Math.round((child.progress || 0) * child.importance));
    } else {
      // Parent task contributes its aggregates
      totalWeight += child.total_weight || BigInt(0);
      weightedProgress += child.weighted_progress || BigInt(0);
    }
  }

  // Add contributions from linked habits
  for (const habit of task.habits) {
    const habitProgress = calculateHabitProgressFromCount(
      habit.currentCount || 0,
      habit.targetCount || 0
    );
    totalWeight += BigInt(habit.importance);
    weightedProgress += BigInt(Math.round(habitProgress * habit.importance));
  }

  return { total_weight: totalWeight, weighted_progress: weightedProgress };
}

/**
 * Update habit's contribution to parent task when habit is logged
 *
 * @param habitId - The habit ID
 * @param oldProgress - Previous completion percentage
 * @param newProgress - New completion percentage
 */
export async function updateHabitProgress(
  habitId: string,
  oldProgress: number,
  newProgress: number
): Promise<void> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: {
      parentTaskId: true,
      importance: true,
    },
  });

  if (!habit || !habit.parentTaskId) return;

  await updateHabitProgressForParent(
    habit.parentTaskId,
    habit.importance,
    oldProgress,
    newProgress
  );
}

/**
 * Update habit contribution directly when parent task and importance are known.
 */
export async function updateHabitProgressForParent(
  parentTaskId: string,
  importance: number,
  oldProgress: number,
  newProgress: number
): Promise<void> {
  const weightedProgressDelta = BigInt(Math.round((newProgress - oldProgress) * importance));
  await propagateAggregates(parentTaskId, BigInt(0), weightedProgressDelta);
}

/**
 * Update habit's contribution to parent task when progress and/or importance changes.
 *
 * @param habitId - The habit ID
 * @param oldProgress - Previous completion percentage
 * @param newProgress - New completion percentage
 * @param oldImportance - Previous importance
 * @param newImportance - New importance
 */
export async function updateHabitContribution(
  habitId: string,
  oldProgress: number,
  newProgress: number,
  oldImportance: number,
  newImportance: number
): Promise<void> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: {
      parentTaskId: true,
    },
  });

  if (!habit || !habit.parentTaskId) return;

  const weightDelta = BigInt(newImportance - oldImportance);
  const oldWeighted = Math.round(oldProgress * oldImportance);
  const newWeighted = Math.round(newProgress * newImportance);
  const weightedProgressDelta = BigInt(newWeighted - oldWeighted);

  await propagateAggregates(habit.parentTaskId, weightDelta, weightedProgressDelta);
}

/**
 * Add habit to parent task aggregates
 *
 * @param habitId - The habit ID
 */
export async function addHabitToTask(habitId: string): Promise<void> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: {
      parentTaskId: true,
      importance: true,
    },
  });

  if (!habit || !habit.parentTaskId) return;

  const habitProgress = await calculateHabitCompletion(habitId);
  const weight = BigInt(habit.importance);
  const weightedProgress = BigInt(Math.round(habitProgress * habit.importance));

  await addChildToTask(habit.parentTaskId, weight, weightedProgress);
}

/**
 * Remove habit from parent task aggregates
 *
 * @param habitId - The habit ID
 * @param parentTaskId - The parent task ID (needed since habit is being deleted)
 * @param importance - Habit's importance (needed since habit is being deleted)
 */
export async function removeHabitFromTask(
  habitId: string,
  parentTaskId: string,
  importance: number
): Promise<void> {
  const habitProgress = await calculateHabitCompletion(habitId);
  const weight = BigInt(importance);
  const weightedProgress = BigInt(Math.round(habitProgress * importance));

  await removeChildFromTask(parentTaskId, weight, weightedProgress);
}

/**
 * Calculate progress for a specific label (on-demand)
 * Uses importance-weighted averaging across all root tasks and habits with this label
 */
export async function calculateLabelProgress(labelId: string): Promise<{
  overallProgress: number;
  taskCount: number;
  habitCount: number;
}> {
  const tasksWithLabel = await prisma.task.findMany({
    where: {
      parentId: null,
      taskLabels: {
        some: { labelId: labelId },
      },
    },
    select: {
      id: true,
      importance: true,
      progress: true,
      total_weight: true,
      weighted_progress: true,
      _count: {
        select: { children: true, habits: true },
      },
    },
  });

  const habitsWithLabel = await prisma.habit.findMany({
    where: {
      parentTaskId: null, // Only top-level habits
      habitLabels: {
        some: { labelId: labelId },
      },
    },
    select: {
      id: true,
      importance: true,
      targetCount: true,
      currentCount: true,
    },
  });

  let totalWeight = BigInt(0);
  let weightedProgress = BigInt(0);

  // Add task contributions
  for (const task of tasksWithLabel) {
    const isLeaf = task._count.children === 0 && task._count.habits === 0;

    if (isLeaf) {
      totalWeight += BigInt(task.importance);
      weightedProgress += BigInt(Math.round((task.progress || 0) * task.importance));
    } else {
      totalWeight += task.total_weight || BigInt(0);
      weightedProgress += task.weighted_progress || BigInt(0);
    }
  }

  // Add habit contributions
  for (const habit of habitsWithLabel) {
    const habitProgress = calculateHabitProgressFromCount(
      habit.currentCount || 0,
      habit.targetCount || 0
    );
    totalWeight += BigInt(habit.importance);
    weightedProgress += BigInt(Math.round(habitProgress * habit.importance));
  }

  const overallProgress = totalWeight > BigInt(0)
    ? Number(weightedProgress) / Number(totalWeight)
    : 0;

  return {
    overallProgress: roundToTwoDecimals(Math.max(0, Math.min(100, overallProgress))),
    taskCount: tasksWithLabel.length,
    habitCount: habitsWithLabel.length,
  };
}

/**
 * Calculate progress for a specific group (on-demand)
 */
export async function calculateGroupProgress(groupId: string): Promise<{
  overallProgress: number;
  taskCount: number;
  habitCount: number;
}> {
  const tasksInGroup = await prisma.task.findMany({
    where: {
      parentId: null,
      groupId: groupId,
    },
    select: {
      id: true,
      importance: true,
      progress: true,
      total_weight: true,
      weighted_progress: true,
      _count: {
        select: { children: true, habits: true },
      },
    },
  });

  const habitsInGroup = await prisma.habit.findMany({
    where: {
      parentTaskId: null, // Only top-level habits
      groupId: groupId,
    },
    select: {
      id: true,
      importance: true,
      targetCount: true,
      currentCount: true,
    },
  });

  let totalWeight = BigInt(0);
  let weightedProgress = BigInt(0);

  // Add task contributions
  for (const task of tasksInGroup) {
    const isLeaf = task._count.children === 0 && task._count.habits === 0;

    if (isLeaf) {
      totalWeight += BigInt(task.importance);
      // Leaf tasks would need progress from somewhere - skipping for now
    } else {
      totalWeight += task.total_weight || BigInt(0);
      weightedProgress += task.weighted_progress || BigInt(0);
    }
  }

  // Add habit contributions
  for (const habit of habitsInGroup) {
    const habitProgress = calculateHabitProgressFromCount(
      habit.currentCount || 0,
      habit.targetCount || 0
    );
    totalWeight += BigInt(habit.importance);
    weightedProgress += BigInt(Math.round(habitProgress * habit.importance));
  }

  const overallProgress = totalWeight > BigInt(0)
    ? Number(weightedProgress) / Number(totalWeight)
    : 0;

  return {
    overallProgress: roundToTwoDecimals(Math.max(0, Math.min(100, overallProgress))),
    taskCount: tasksInGroup.length,
    habitCount: habitsInGroup.length,
  };
}
