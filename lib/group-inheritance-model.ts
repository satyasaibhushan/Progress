export type GroupTaskNode = {
  id: string
  parentId: string | null
  directGroupId: string | null
}

export type GroupHabitNode = {
  id: string
  parentTaskId: string | null
  directGroupId: string | null
}

export function deriveEffectiveGroups(
  tasks: GroupTaskNode[],
  habits: GroupHabitNode[]
): {
  taskGroups: Map<string, string | null>
  habitGroups: Map<string, string | null>
} {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const taskGroups = new Map<string, string | null>()
  const visiting = new Set<string>()

  const deriveTaskGroup = (taskId: string): string | null => {
    if (taskGroups.has(taskId)) return taskGroups.get(taskId) ?? null
    if (visiting.has(taskId)) {
      throw new Error(`Task hierarchy contains a cycle at ${taskId}`)
    }

    visiting.add(taskId)
    const task = taskById.get(taskId)
    const inheritedGroup = task?.parentId && taskById.has(task.parentId)
      ? deriveTaskGroup(task.parentId)
      : null
    const effectiveGroup = inheritedGroup || task?.directGroupId || null
    visiting.delete(taskId)
    taskGroups.set(taskId, effectiveGroup)
    return effectiveGroup
  }

  tasks.forEach((task) => deriveTaskGroup(task.id))

  const habitGroups = new Map(
    habits.map((habit) => [
      habit.id,
      (habit.parentTaskId ? taskGroups.get(habit.parentTaskId) : null) ||
        habit.directGroupId ||
        null,
    ])
  )

  return { taskGroups, habitGroups }
}
