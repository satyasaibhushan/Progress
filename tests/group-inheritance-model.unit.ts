import { deriveEffectiveGroups } from "@/lib/group-inheritance-model"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const tasks = [
  { id: "old-root", parentId: null, directGroupId: "old-group" },
  { id: "new-root", parentId: null, directGroupId: "new-group" },
  { id: "child", parentId: "old-root", directGroupId: "child-group" },
]
const habits = [
  { id: "habit", parentTaskId: "child", directGroupId: "habit-group" },
]

const initial = deriveEffectiveGroups(tasks, habits)
assertEqual(initial.taskGroups.get("child"), "old-group", "the nearest inherited group wins")
assertEqual(initial.habitGroups.get("habit"), "old-group", "habits inherit the effective task group")

const reparented = deriveEffectiveGroups(
  tasks.map((task) => task.id === "child" ? { ...task, parentId: "new-root" } : task),
  habits
)
assertEqual(reparented.taskGroups.get("child"), "new-group", "reparenting adopts the new ancestry")

const detached = deriveEffectiveGroups(
  tasks.map((task) => task.id === "child" ? { ...task, parentId: null } : task),
  habits
)
assertEqual(detached.taskGroups.get("child"), "child-group", "detaching restores the task's direct group")
assertEqual(detached.habitGroups.get("habit"), "child-group", "linked habits follow the restored task group")
