export type AncestorTask = {
  id: string
  title: string
  parentId: string | null
}

export function resolveRootGoal(
  startingTaskId: string,
  ancestorTaskById: Map<string, AncestorTask>,
): { id: string; title: string } | null {
  let current = ancestorTaskById.get(startingTaskId)
  let latest: { id: string; title: string } | null = current
    ? { id: current.id, title: current.title }
    : null

  const visited = new Set<string>()
  while (current && current.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    const parent = ancestorTaskById.get(current.parentId)
    if (!parent) break
    latest = { id: parent.id, title: parent.title }
    current = parent
  }

  return latest
}
