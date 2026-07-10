import { prisma } from "@/lib/prisma";
import { deriveInheritedLabelSources } from "@/lib/label-inheritance-model";

export async function reconcileUserLabelInheritance(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [tasks, habits] = await Promise.all([
      tx.task.findMany({
        where: { userId },
        select: {
          id: true,
          parentId: true,
          taskLabels: {
            where: { inheritedFromTaskId: null },
            select: { labelId: true },
          },
        },
      }),
      tx.habit.findMany({
        where: { userId },
        select: {
          id: true,
          parentTaskId: true,
          habitLabels: {
            where: { inheritedFromTaskId: null },
            select: { labelId: true },
          },
        },
      }),
    ]);

    const directTaskLabels = new Map(
      tasks.map((task) => [
        task.id,
        new Set(task.taskLabels.map((label) => label.labelId)),
      ])
    );
    const directHabitLabels = new Map(
      habits.map((habit) => [
        habit.id,
        new Set(habit.habitLabels.map((label) => label.labelId)),
      ])
    );
    const model = deriveInheritedLabelSources(
      tasks,
      habits,
      directTaskLabels,
      directHabitLabels
    );

    await tx.taskLabel.deleteMany({
      where: {
        inheritedFromTaskId: { not: null },
        task: { userId },
      },
    });
    await tx.habitLabel.deleteMany({
      where: {
        inheritedFromTaskId: { not: null },
        habit: { userId },
      },
    });

    const inheritedTaskLabels = tasks.flatMap((task) => (
      [...(model.taskSources.get(task.id) || new Map()).entries()].map(
        ([labelId, inheritedFromTaskId]) => ({
          taskId: task.id,
          labelId,
          inheritedFromTaskId,
        })
      )
    ));
    const inheritedHabitLabels = habits.flatMap((habit) => (
      [...(model.habitSources.get(habit.id) || new Map()).entries()].map(
        ([labelId, inheritedFromTaskId]) => ({
          habitId: habit.id,
          labelId,
          inheritedFromTaskId,
        })
      )
    ));

    if (inheritedTaskLabels.length > 0) {
      await tx.taskLabel.createMany({ data: inheritedTaskLabels, skipDuplicates: true });
    }
    if (inheritedHabitLabels.length > 0) {
      await tx.habitLabel.createMany({ data: inheritedHabitLabels, skipDuplicates: true });
    }
  });
}
