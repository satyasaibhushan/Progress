export type LabelTask = {
  id: string;
  parentId: string | null;
};

export type LabelHabit = {
  id: string;
  parentTaskId: string | null;
};

export type LabelInheritanceModel = {
  taskSources: Map<string, Map<string, string>>;
  habitSources: Map<string, Map<string, string>>;
};

export function deriveInheritedLabelSources(
  tasks: LabelTask[],
  habits: LabelHabit[],
  directTaskLabels: Map<string, Set<string>>,
  directHabitLabels: Map<string, Set<string>>
): LabelInheritanceModel {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const taskSources = new Map<string, Map<string, string>>();
  const effectiveTaskSources = new Map<string, Map<string, string>>();
  const visiting = new Set<string>();

  const deriveTask = (taskId: string): Map<string, string> => {
    const cached = effectiveTaskSources.get(taskId);
    if (cached) return cached;
    if (visiting.has(taskId)) {
      throw new Error(`Task hierarchy contains a cycle at ${taskId}`);
    }

    visiting.add(taskId);
    const task = taskById.get(taskId);
    const directLabels = directTaskLabels.get(taskId) || new Set<string>();
    const inherited = new Map<string, string>();

    if (task?.parentId && taskById.has(task.parentId)) {
      for (const [labelId, sourceTaskId] of deriveTask(task.parentId)) {
        if (!directLabels.has(labelId)) inherited.set(labelId, sourceTaskId);
      }
    }

    const effective = new Map(inherited);
    directLabels.forEach((labelId) => effective.set(labelId, taskId));
    taskSources.set(taskId, inherited);
    effectiveTaskSources.set(taskId, effective);
    visiting.delete(taskId);
    return effective;
  };

  tasks.forEach((task) => deriveTask(task.id));

  const habitSources = new Map<string, Map<string, string>>();
  for (const habit of habits) {
    const directLabels = directHabitLabels.get(habit.id) || new Set<string>();
    const inherited = new Map<string, string>();
    if (habit.parentTaskId) {
      const parentSources = effectiveTaskSources.get(habit.parentTaskId);
      parentSources?.forEach((sourceTaskId, labelId) => {
        if (!directLabels.has(labelId)) inherited.set(labelId, sourceTaskId);
      });
    }
    habitSources.set(habit.id, inherited);
  }

  return { taskSources, habitSources };
}
