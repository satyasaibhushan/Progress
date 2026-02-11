export type TaskNode = {
  id: string
  parentId: string | null
}

export type TreeNode<T extends TaskNode> = T & {
  children: Array<TreeNode<T>>
}

export function groupTasksByParentId<T extends TaskNode>(tasks: T[]): Map<string | null, T[]> {
  const childrenByParentId = new Map<string | null, T[]>()

  for (const task of tasks) {
    const siblings = childrenByParentId.get(task.parentId) || []
    siblings.push(task)
    childrenByParentId.set(task.parentId, siblings)
  }

  return childrenByParentId
}

export function indexTasksById<T extends { id: string }>(tasks: T[]): Map<string, T> {
  return new Map(tasks.map((task) => [task.id, task]))
}

export function buildTaskTree<T extends TaskNode>(
  childrenByParentId: Map<string | null, T[]>,
  parentId: string | null
): Array<TreeNode<T>> {
  const children = childrenByParentId.get(parentId) || []
  return children.map((task) => ({
    ...task,
    children: buildTaskTree(childrenByParentId, task.id),
  }))
}

export function treeContainsTaskId<T extends TaskNode>(
  task: TreeNode<T>,
  targetId: string
): boolean {
  if (task.id === targetId) return true
  return task.children.some((child) => treeContainsTaskId(child, targetId))
}
