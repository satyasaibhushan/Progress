import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deriveEffectiveGroups } from "@/lib/group-inheritance-model";

export async function reconcileUserGroupInheritance(userId: string): Promise<void> {
  const [tasks, habits] = await Promise.all([
    prisma.task.findMany({
      where: { userId },
      select: { id: true, parentId: true, groupId: true, directGroupId: true },
    }),
    prisma.habit.findMany({
      where: { userId },
      select: { id: true, parentTaskId: true, groupId: true, directGroupId: true },
    }),
  ]);
  const { taskGroups, habitGroups } = deriveEffectiveGroups(tasks, habits);
  const updates: Prisma.PrismaPromise<unknown>[] = tasks.flatMap((task) => {
    const effectiveGroup = taskGroups.get(task.id) || null;
    if (task.groupId === effectiveGroup) return [];
    return [prisma.task.update({ where: { id: task.id }, data: { groupId: effectiveGroup } })];
  });

  for (const habit of habits) {
    const effectiveGroup = habitGroups.get(habit.id) || null;
    if (habit.groupId === effectiveGroup) continue;
    updates.push(prisma.habit.update({ where: { id: habit.id }, data: { groupId: effectiveGroup } }));
  }

  if (updates.length > 0) await prisma.$transaction(updates);
}
