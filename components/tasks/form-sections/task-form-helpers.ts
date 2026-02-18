import { Group, Habit, Task } from "@/types";

export interface GroupConflictInfo {
  hasConflict: boolean;
  childTasksCount: number;
  habitsCount: number;
  affectedGroups: string[];
}

export interface DateBoundsConflictInfo {
  hasConflict: boolean;
  childTasksCount: number;
  habitsCount: number;
}

export function collectChildTasks(task: Task): Task[] {
  const children: Task[] = [];
  if (task.children && task.children.length > 0) {
    task.children.forEach((child) => {
      children.push(child);
      children.push(...collectChildTasks(child));
    });
  }
  return children;
}

export function collectLinkedHabits(task: Task): Habit[] {
  const habits: Habit[] = [...(task.habits || [])];
  if (task.children && task.children.length > 0) {
    task.children.forEach((child) => {
      habits.push(...collectLinkedHabits(child));
    });
  }
  return habits;
}

function hasOutOfBoundsTaskDates(
  task: Task,
  newStartDate: string | undefined,
  newDeadline: string | undefined
): boolean {
  let nextStartDate = task.startDate;
  let nextDeadline = task.deadline;
  const originalStartDate = task.startDate;
  const originalDeadline = task.deadline;
  let startDateClamped = false;
  let deadlineClamped = false;

  if (newStartDate && nextStartDate && nextStartDate < newStartDate) {
    nextStartDate = newStartDate;
    startDateClamped = true;
  }

  if (newDeadline && nextDeadline && nextDeadline > newDeadline) {
    nextDeadline = newDeadline;
    deadlineClamped = true;
  }

  if (nextStartDate && nextDeadline && nextStartDate > nextDeadline && (startDateClamped || deadlineClamped)) {
    if (newDeadline && nextStartDate > newDeadline) {
      nextStartDate = newDeadline;
      nextDeadline = newDeadline;
    } else {
      nextDeadline = nextStartDate;
    }
  }

  return nextStartDate !== originalStartDate || nextDeadline !== originalDeadline;
}

function hasOutOfBoundsHabitDates(
  habit: Habit,
  newStartDate: string | undefined,
  newDeadline: string | undefined
): boolean {
  let nextStartDate = habit.startDate;
  let nextEndDate = habit.endDate;
  const originalStartDate = habit.startDate;
  const originalEndDate = habit.endDate;
  let startDateClamped = false;
  let endDateClamped = false;

  if (newStartDate && nextStartDate && nextStartDate < newStartDate) {
    nextStartDate = newStartDate;
    startDateClamped = true;
  }

  if (newDeadline && nextEndDate && nextEndDate > newDeadline) {
    nextEndDate = newDeadline;
    endDateClamped = true;
  }

  if (nextStartDate && nextEndDate && nextStartDate > nextEndDate && (startDateClamped || endDateClamped)) {
    if (newDeadline && nextStartDate > newDeadline) {
      nextStartDate = newDeadline;
      nextEndDate = newDeadline;
    } else {
      nextEndDate = nextStartDate;
    }
  }

  return nextStartDate !== originalStartDate || nextEndDate !== originalEndDate;
}

export function checkDateBoundsConflicts(
  newStartDate: string | undefined,
  newDeadline: string | undefined,
  currentTask: Task
): DateBoundsConflictInfo {
  if (!newStartDate && !newDeadline) {
    return {
      hasConflict: false,
      childTasksCount: 0,
      habitsCount: 0,
    };
  }

  const taskWithCount = currentTask as Task & { _count?: { children?: number; habits?: number } };
  const loadedChildren = collectChildTasks(currentTask);
  const loadedHabits = collectLinkedHabits(currentTask);

  if (
    loadedChildren.length === 0 &&
    loadedHabits.length === 0 &&
    ((taskWithCount._count?.children || 0) > 0 || (taskWithCount._count?.habits || 0) > 0)
  ) {
    return {
      hasConflict: true,
      childTasksCount: taskWithCount._count?.children || 0,
      habitsCount: taskWithCount._count?.habits || 0,
    };
  }

  const affectedChildTasks = loadedChildren.filter((task) =>
    hasOutOfBoundsTaskDates(task, newStartDate, newDeadline)
  ).length;

  const affectedHabits = loadedHabits.filter((habit) =>
    hasOutOfBoundsHabitDates(habit, newStartDate, newDeadline)
  ).length;

  return {
    hasConflict: affectedChildTasks > 0 || affectedHabits > 0,
    childTasksCount: affectedChildTasks,
    habitsCount: affectedHabits,
  };
}

export function checkGroupConflicts(
  newGroupId: string | undefined,
  currentTask: Task,
  groups: Group[]
): GroupConflictInfo {
  const taskWithCount = currentTask as Task & { _count?: { children?: number; habits?: number } };
  const hasChildrenData = !!(currentTask.children && currentTask.children.length > 0);
  const hasHabitsData = !!(currentTask.habits && currentTask.habits.length > 0);
  const hasChildrenCount = !!(taskWithCount._count?.children && taskWithCount._count.children > 0);
  const hasHabitsCount = !!(taskWithCount._count?.habits && taskWithCount._count.habits > 0);

  if ((hasChildrenCount || hasHabitsCount) && !hasChildrenData && !hasHabitsData) {
    return {
      hasConflict: true,
      childTasksCount: taskWithCount._count?.children || 0,
      habitsCount: taskWithCount._count?.habits || 0,
      affectedGroups: [],
    };
  }

  const allChildren = hasChildrenData ? collectChildTasks(currentTask) : [];
  const linkedHabits = (hasHabitsData ? currentTask.habits : []) as Habit[];

  const affectedGroups = new Set<string>();
  let conflictingChildren = 0;
  let conflictingHabits = 0;

  allChildren.forEach((child) => {
    const childGroupId = child.groupId;
    if (childGroupId && childGroupId !== newGroupId) {
      conflictingChildren++;
      const groupName = groups.find((group) => group.id === childGroupId)?.name || childGroupId;
      affectedGroups.add(groupName);
    }
  });

  linkedHabits.forEach((habit) => {
    const habitGroupId = habit.groupId;
    if (habitGroupId && habitGroupId !== newGroupId) {
      conflictingHabits++;
      const groupName = groups.find((group) => group.id === habitGroupId)?.name || habitGroupId;
      affectedGroups.add(groupName);
    }
  });

  return {
    hasConflict: conflictingChildren > 0 || conflictingHabits > 0,
    childTasksCount: conflictingChildren,
    habitsCount: conflictingHabits,
    affectedGroups: Array.from(affectedGroups),
  };
}

export function flattenTasks(taskList: Task[]): Task[] {
  const flattened: Task[] = [];
  const traverse = (tasks: Task[]) => {
    tasks.forEach((task) => {
      flattened.push(task);
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      }
    });
  };
  traverse(taskList);
  return flattened;
}

export function isDescendant(ancestor: Task, candidateId: string): boolean {
  if (ancestor.id === candidateId) return true;
  if (!ancestor.children || ancestor.children.length === 0) return false;
  return ancestor.children.some((child) => isDescendant(child, candidateId));
}
