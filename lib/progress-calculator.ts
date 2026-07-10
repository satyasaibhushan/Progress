import { prisma } from "./prisma";
import {
  calculateHabitProgress,
  sumHabitLogCounts,
} from "./progress-model";

export function calculateHabitProgressFromCount(
  currentCount: number,
  targetCount: number
): number {
  return calculateHabitProgress(currentCount, targetCount);
}

export async function calculateHabitCompletion(habitId: string): Promise<number> {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: {
      targetCount: true,
      habitLogs: {
        select: { count: true },
      },
    },
  });

  if (!habit) {
    throw new Error(`Habit with ID ${habitId} not found`);
  }

  return calculateHabitProgress(
    sumHabitLogCounts(habit.habitLogs),
    habit.targetCount
  );
}
