import { Group, Habit, Task } from "@/types";

export interface GroupConflictInfo {
  hasConflict: boolean;
  childTasksCount: number;
  habitsCount: number;
  affectedGroups: string[];
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
