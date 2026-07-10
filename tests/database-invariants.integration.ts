import { prisma } from "@/lib/prisma"
import { reconcileUserDateBounds } from "@/lib/server/inheritance/bounds"
import { reconcileUserGroupInheritance } from "@/lib/server/inheritance/groups"
import { reconcileUserLabelInheritance } from "@/lib/server/inheritance/labels"
import { reconcileUserProgress } from "@/lib/server/progress/reconcile"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

async function main(): Promise<void> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const user = await prisma.user.create({
    data: { email: `database-invariants-${runId}@example.test` },
  })

  try {
    const [oldGroup, newGroup, taskDirectGroup, habitDirectGroup] = await Promise.all(
      ["old", "new", "task-direct", "habit-direct"].map((name) =>
        prisma.group.create({
          data: { name: `${name}-${runId}`, userId: user.id },
        })
      )
    )
    const [oldLabel, newLabel] = await Promise.all(
      ["old", "new"].map((name) =>
        prisma.label.create({
          data: { name: `${name}-${runId}`, userId: user.id },
        })
      )
    )

    const oldRoot = await prisma.task.create({
      data: {
        title: `Old root ${runId}`,
        userId: user.id,
        groupId: oldGroup.id,
        directGroupId: oldGroup.id,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        deadline: new Date("2026-12-31T00:00:00.000Z"),
        taskLabels: { create: { labelId: oldLabel.id } },
      },
    })
    const newRoot = await prisma.task.create({
      data: {
        title: `New root ${runId}`,
        userId: user.id,
        groupId: newGroup.id,
        directGroupId: newGroup.id,
        taskLabels: { create: { labelId: newLabel.id } },
      },
    })
    const child = await prisma.task.create({
      data: {
        title: `Child ${runId}`,
        userId: user.id,
        parentId: oldRoot.id,
        groupId: oldGroup.id,
        directGroupId: taskDirectGroup.id,
        importance: 10,
        progress: 99,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        deadline: new Date("2027-12-31T00:00:00.000Z"),
      },
    })
    const habit = await prisma.habit.create({
      data: {
        title: `Habit ${runId}`,
        userId: user.id,
        parentTaskId: child.id,
        groupId: oldGroup.id,
        directGroupId: habitDirectGroup.id,
        targetCount: 4,
        importance: 10,
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        endDate: new Date("2028-12-31T00:00:00.000Z"),
      },
    })

    await prisma.habitLog.create({
      data: {
        habitId: habit.id,
        date: new Date("2026-07-10T00:00:00.000Z"),
        count: 2,
      },
    })
    assertEqual(
      (await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })).currentCount,
      2,
      "the log insert trigger updates the habit cache"
    )

    await prisma.habitLog.update({
      where: { habitId_date: { habitId: habit.id, date: new Date("2026-07-10T00:00:00.000Z") } },
      data: { count: 3 },
    })
    assertEqual(
      (await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })).currentCount,
      3,
      "the log update trigger updates the habit cache"
    )

    await prisma.habitLog.update({
      where: { habitId_date: { habitId: habit.id, date: new Date("2026-07-10T00:00:00.000Z") } },
      data: { count: 2 },
    })

    await Promise.all([
      reconcileUserGroupInheritance(user.id),
      reconcileUserDateBounds(user.id),
    ])
    await reconcileUserLabelInheritance(user.id)
    await reconcileUserProgress(user.id)

    const repairedChild = await prisma.task.findUniqueOrThrow({ where: { id: child.id } })
    const repairedHabit = await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })
    const repairedRoot = await prisma.task.findUniqueOrThrow({ where: { id: oldRoot.id } })
    assertEqual(repairedChild.groupId, oldGroup.id, "child inherits its current ancestor group")
    assertEqual(repairedHabit.groupId, oldGroup.id, "habit inherits its task ancestry group")
    assertEqual(repairedChild.startDate?.toISOString().slice(0, 10), "2026-01-01", "child start is clamped")
    assertEqual(repairedChild.deadline?.toISOString().slice(0, 10), "2026-12-31", "child deadline is clamped")
    assertEqual(repairedHabit.startDate?.toISOString().slice(0, 10), "2026-01-01", "habit start is clamped")
    assertEqual(repairedHabit.endDate?.toISOString().slice(0, 10), "2026-12-31", "habit end is clamped")
    assertEqual(repairedChild.progress, 50, "linked habit progress replaces a task's stale manual progress")
    assertEqual(repairedRoot.progress, 50, "canonical progress rolls up through the hierarchy")

    const childLabelIds = new Set(
      (await prisma.taskLabel.findMany({ where: { taskId: child.id } })).map((link) => link.labelId)
    )
    assertEqual(childLabelIds.has(oldLabel.id), true, "labels inherit from the current ancestry")

    await prisma.task.update({ where: { id: child.id }, data: { parentId: newRoot.id } })
    await reconcileUserGroupInheritance(user.id)
    await reconcileUserLabelInheritance(user.id)
    assertEqual(
      (await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).groupId,
      newGroup.id,
      "reparenting replaces the old inherited group"
    )
    const reparentedLabelIds = new Set(
      (await prisma.taskLabel.findMany({ where: { taskId: child.id } })).map((link) => link.labelId)
    )
    assertEqual(reparentedLabelIds.has(oldLabel.id), false, "reparenting removes stale inherited labels")
    assertEqual(reparentedLabelIds.has(newLabel.id), true, "reparenting adopts new inherited labels")

    await prisma.task.update({ where: { id: child.id }, data: { parentId: null } })
    await reconcileUserGroupInheritance(user.id)
    assertEqual(
      (await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).groupId,
      taskDirectGroup.id,
      "detaching restores a task's direct group"
    )
    assertEqual(
      (await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })).groupId,
      taskDirectGroup.id,
      "linked habits follow the restored task group"
    )

    await prisma.habitLog.delete({
      where: { habitId_date: { habitId: habit.id, date: new Date("2026-07-10T00:00:00.000Z") } },
    })
    assertEqual(
      (await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })).currentCount,
      0,
      "the log delete trigger updates the habit cache"
    )
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})
