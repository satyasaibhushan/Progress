export type MembershipTask = {
  id: string
  parentId: string | null
  groupId: string | null
}

export type TaskGraph = {
  taskById: Map<string, MembershipTask>
  childrenByParentId: Map<string | null, string[]>
}

export function buildTaskGraph(tasks: MembershipTask[]): TaskGraph {
  const taskById = new Map<string, MembershipTask>()
  const childrenByParentId = new Map<string | null, string[]>()

  for (const task of tasks) {
    taskById.set(task.id, task)
    const siblings = childrenByParentId.get(task.parentId) || []
    siblings.push(task.id)
    childrenByParentId.set(task.parentId, siblings)
  }

  return {
    taskById,
    childrenByParentId,
  }
}

export function hasGroupInTaskAncestry(
  taskId: string,
  groupId: string,
  taskById: Map<string, MembershipTask>,
  memo: Map<string, boolean>
): boolean {
  const cacheKey = `${taskId}:${groupId}`
  const cached = memo.get(cacheKey)
  if (typeof cached === "boolean") return cached

  let current = taskById.get(taskId)
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.groupId === groupId) {
      memo.set(cacheKey, true)
      return true
    }

    if (!current.parentId) break
    current = taskById.get(current.parentId)
  }

  memo.set(cacheKey, false)
  return false
}

export function hasLabelInTaskAncestry(
  taskId: string,
  labelId: string,
  taskById: Map<string, { id: string; parentId: string | null }>,
  directLabelIdsByTaskId: Map<string, Set<string>>,
  memo: Map<string, boolean>
): boolean {
  const cacheKey = `${taskId}:${labelId}`
  const cached = memo.get(cacheKey)
  if (typeof cached === "boolean") return cached

  let current = taskById.get(taskId)
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)

    const directLabels = directLabelIdsByTaskId.get(current.id)
    if (directLabels?.has(labelId)) {
      memo.set(cacheKey, true)
      return true
    }

    if (!current.parentId) break
    current = taskById.get(current.parentId)
  }

  memo.set(cacheKey, false)
  return false
}
