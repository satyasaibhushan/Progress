import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  clampScheduleToBounds,
  combineDateBounds,
  deriveEffectiveTaskBounds,
  type EffectiveDateBounds,
} from "@/lib/hierarchy-bounds";

const EMPTY_BOUNDS: EffectiveDateBounds = {
  minStartDate: null,
  maxEndDate: null,
};

export async function getEffectiveTaskBounds(
  taskId: string,
  userId: string
): Promise<EffectiveDateBounds | null> {
  const tasks = await prisma.task.findMany({
    where: { userId },
    select: { id: true, parentId: true, startDate: true, deadline: true },
  });
  if (!tasks.some((task) => task.id === taskId)) return null;
  return deriveEffectiveTaskBounds(tasks).get(taskId) || null;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

export async function reconcileUserDateBounds(userId: string): Promise<void> {
  const [tasks, habits] = await Promise.all([
    prisma.task.findMany({
      where: { userId },
      select: { id: true, parentId: true, startDate: true, deadline: true },
    }),
    prisma.habit.findMany({
      where: { userId },
      select: { id: true, parentTaskId: true, startDate: true, endDate: true },
    }),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const repairedBounds = new Map<string, EffectiveDateBounds>();
  const repairedSchedules = new Map<string, { startDate: Date | null; deadline: Date | null }>();
  const visiting = new Set<string>();

  const repairTask = (taskId: string): EffectiveDateBounds => {
    const cached = repairedBounds.get(taskId);
    if (cached) return cached;
    if (visiting.has(taskId)) throw new Error(`Task hierarchy contains a cycle at ${taskId}`);
    visiting.add(taskId);
    const task = taskById.get(taskId);
    const parentBounds = task?.parentId && taskById.has(task.parentId)
      ? repairTask(task.parentId)
      : EMPTY_BOUNDS;
    const repaired = clampScheduleToBounds(
      task?.startDate || null,
      task?.deadline || null,
      parentBounds
    );
    const bounds = combineDateBounds(parentBounds, repaired.startDate, repaired.endDate);
    visiting.delete(taskId);
    repairedSchedules.set(taskId, { startDate: repaired.startDate, deadline: repaired.endDate });
    repairedBounds.set(taskId, bounds);
    return bounds;
  };

  tasks.forEach((task) => repairTask(task.id));
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const task of tasks) {
    const repaired = repairedSchedules.get(task.id)!;
    if (sameDate(task.startDate, repaired.startDate) && sameDate(task.deadline, repaired.deadline)) continue;
    updates.push(prisma.task.update({ where: { id: task.id }, data: repaired }));
  }
  for (const habit of habits) {
    const parentBounds = habit.parentTaskId
      ? repairedBounds.get(habit.parentTaskId) || EMPTY_BOUNDS
      : EMPTY_BOUNDS;
    const repaired = clampScheduleToBounds(habit.startDate, habit.endDate, parentBounds);
    if (sameDate(habit.startDate, repaired.startDate) && sameDate(habit.endDate, repaired.endDate)) continue;
    updates.push(prisma.habit.update({ where: { id: habit.id }, data: repaired }));
  }
  if (updates.length > 0) await prisma.$transaction(updates);
}
