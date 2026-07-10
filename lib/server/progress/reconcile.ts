import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { deriveProgressModel, type ProgressModel } from "@/lib/progress-model"

type ProgressClient = Pick<Prisma.TransactionClient, "habit" | "task">

async function loadProgressModel(
  client: ProgressClient,
  userId: string
): Promise<ProgressModel> {
  const [tasks, habits] = await Promise.all([
    client.task.findMany({
      where: { userId },
      select: {
        id: true,
        parentId: true,
        importance: true,
        progress: true,
      },
    }),
    client.habit.findMany({
      where: { userId },
      select: {
        id: true,
        parentTaskId: true,
        importance: true,
        targetCount: true,
        currentCount: true,
        habitLogs: {
          select: {
            count: true,
          },
        },
      },
    }),
  ])

  return deriveProgressModel(tasks, habits)
}

export async function getUserProgressModel(userId: string): Promise<ProgressModel> {
  return loadProgressModel(prisma, userId)
}

export async function reconcileUserProgress(userId: string): Promise<ProgressModel> {
  return prisma.$transaction(async (tx) => {
    const model = await loadProgressModel(tx, userId)

    const habits = await tx.habit.findMany({
      where: { userId },
      select: {
        id: true,
        currentCount: true,
      },
    })

    for (const habit of habits) {
      const derived = model.habits.get(habit.id)
      if (!derived || derived.currentCount === habit.currentCount) continue
      await tx.habit.update({
        where: { id: habit.id },
        data: { currentCount: derived.currentCount },
      })
    }

    const tasks = await tx.task.findMany({
      where: { userId },
      select: {
        id: true,
        progress: true,
        total_weight: true,
        weighted_progress: true,
      },
    })

    for (const task of tasks) {
      const derived = model.tasks.get(task.id)
      if (!derived) continue

      const totalWeight = derived.isLeaf ? null : BigInt(derived.totalWeight)
      const weightedProgress = derived.isLeaf ? null : BigInt(derived.weightedProgress)
      const progressChanged = !derived.isLeaf && task.progress !== derived.progress
      if (
        !progressChanged &&
        task.total_weight === totalWeight &&
        task.weighted_progress === weightedProgress
      ) {
        continue
      }

      await tx.task.update({
        where: { id: task.id },
        data: {
          ...(progressChanged ? { progress: derived.progress } : {}),
          total_weight: totalWeight,
          weighted_progress: weightedProgress,
        },
      })
    }

    return model
  })
}
