/**
 * Migration script to enforce label and group inheritance rules
 * 
 * This script:
 * 1. Propagates labels from parent tasks to all their children (recursively)
 * 2. Propagates labels from parent tasks to all their linked habits
 * 3. Propagates groups from parent tasks to all their children (recursively)
 * 4. Propagates groups from parent tasks to all their linked habits
 * 
 * Run with: npx tsx prisma/migrations/migrate-inheritance.ts
 */

import { PrismaClient } from "../../lib/generated/prisma"

const prisma = new PrismaClient()

async function migrateInheritance() {
  console.log("Starting inheritance migration...")

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true },
  })

  for (const user of users) {
    console.log(`Processing user ${user.id}...`)

    // Get all root tasks (tasks with no parent)
    const rootTasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        parentId: null,
      },
      include: {
        taskLabels: {
          select: { labelId: true },
        },
      },
    })

    // Process each root task and its descendants
    for (const rootTask of rootTasks) {
      await propagateToDescendants(rootTask.id, user.id, rootTask.taskLabels.map((tl) => tl.labelId), rootTask.groupId)
    }
  }

  console.log("Migration completed!")
}

async function propagateToDescendants(
  taskId: string,
  userId: string,
  parentLabels: string[],
  parentGroupId: string | null
): Promise<void> {
  // Get all direct children
  const children = await prisma.task.findMany({
    where: {
      parentId: taskId,
      userId,
    },
    include: {
      taskLabels: {
        select: { labelId: true },
      },
    },
  })

  // Get all linked habits
  const habits = await prisma.habit.findMany({
    where: {
      parentTaskId: taskId,
      userId,
    },
    include: {
      habitLabels: {
        select: { labelId: true },
      },
    },
  })

  // Propagate labels to children
  for (const child of children) {
    const existingLabelIds = child.taskLabels.map((tl) => tl.labelId)
    const labelsToAdd = parentLabels.filter((labelId) => !existingLabelIds.includes(labelId))

    for (const labelId of labelsToAdd) {
      await prisma.taskLabel.create({
        data: {
          taskId: child.id,
          labelId,
        },
      }).catch(() => {
        // Ignore if already exists
      })
    }

    // Propagate group if parent has one
    if (parentGroupId && child.groupId !== parentGroupId) {
      await prisma.task.update({
        where: { id: child.id },
        data: { groupId: parentGroupId },
      })
    }

    // Get updated labels for this child (including newly added ones)
    const updatedChild = await prisma.task.findUnique({
      where: { id: child.id },
      include: {
        taskLabels: {
          select: { labelId: true },
        },
      },
    })

    // Recursively propagate to grandchildren
    if (updatedChild) {
      const allLabels = [...new Set([...parentLabels, ...updatedChild.taskLabels.map((tl) => tl.labelId)])]
      await propagateToDescendants(child.id, userId, allLabels, parentGroupId || child.groupId)
    }
  }

  // Propagate labels to linked habits
  for (const habit of habits) {
    const existingLabelIds = habit.habitLabels.map((hl) => hl.labelId)
    const labelsToAdd = parentLabels.filter((labelId) => !existingLabelIds.includes(labelId))

    for (const labelId of labelsToAdd) {
      await prisma.habitLabel.create({
        data: {
          habitId: habit.id,
          labelId,
        },
      }).catch(() => {
        // Ignore if already exists
      })
    }

    // Propagate group if parent has one
    if (parentGroupId && habit.groupId !== parentGroupId) {
      await prisma.habit.update({
        where: { id: habit.id },
        data: { groupId: parentGroupId },
      })
    }
  }
}

// Run migration
migrateInheritance()
  .catch((error) => {
    console.error("Migration failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
