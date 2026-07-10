export type ScheduledTask = {
  id: string;
  parentId: string | null;
  startDate: Date | null;
  deadline: Date | null;
};

export type EffectiveDateBounds = {
  minStartDate: Date | null;
  maxEndDate: Date | null;
};

function laterDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

export function combineDateBounds(
  parent: EffectiveDateBounds,
  startDate: Date | null,
  endDate: Date | null
): EffectiveDateBounds {
  return {
    minStartDate: laterDate(parent.minStartDate, startDate),
    maxEndDate: earlierDate(parent.maxEndDate, endDate),
  };
}

export function clampScheduleToBounds(
  startDate: Date | null,
  endDate: Date | null,
  bounds: EffectiveDateBounds
): { startDate: Date | null; endDate: Date | null } {
  let nextStart = startDate;
  let nextEnd = endDate;

  if (nextStart && bounds.minStartDate && nextStart < bounds.minStartDate) {
    nextStart = bounds.minStartDate;
  }
  if (nextStart && bounds.maxEndDate && nextStart > bounds.maxEndDate) {
    nextStart = bounds.maxEndDate;
  }
  if (nextEnd && bounds.maxEndDate && nextEnd > bounds.maxEndDate) {
    nextEnd = bounds.maxEndDate;
  }
  if (nextEnd && bounds.minStartDate && nextEnd < bounds.minStartDate) {
    nextEnd = bounds.minStartDate;
  }
  if (nextStart && nextEnd && nextStart > nextEnd) {
    nextEnd = nextStart;
  }

  return { startDate: nextStart, endDate: nextEnd };
}

export function deriveEffectiveTaskBounds(
  tasks: ScheduledTask[]
): Map<string, EffectiveDateBounds> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const boundsByTaskId = new Map<string, EffectiveDateBounds>();
  const visiting = new Set<string>();

  const derive = (taskId: string): EffectiveDateBounds => {
    const cached = boundsByTaskId.get(taskId);
    if (cached) return cached;
    if (visiting.has(taskId)) throw new Error(`Task hierarchy contains a cycle at ${taskId}`);
    visiting.add(taskId);
    const task = taskById.get(taskId);
    const parentBounds = task?.parentId && taskById.has(task.parentId)
      ? derive(task.parentId)
      : { minStartDate: null, maxEndDate: null };
    const bounds = combineDateBounds(
      parentBounds,
      task?.startDate || null,
      task?.deadline || null
    );
    visiting.delete(taskId);
    boundsByTaskId.set(taskId, bounds);
    return bounds;
  };

  tasks.forEach((task) => derive(task.id));
  return boundsByTaskId;
}
