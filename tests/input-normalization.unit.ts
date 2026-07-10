import { createGroupSchema } from "@/lib/validations/group"
import { createHabitSchema } from "@/lib/validations/habit"
import { createLabelSchema } from "@/lib/validations/label"
import { createTaskSchema } from "@/lib/validations/task"
import { HabitType } from "@prisma/client"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

for (const [name, result] of [
  ["task", createTaskSchema.safeParse({ title: "   ", importance: 50 })],
  ["habit", createHabitSchema.safeParse({ title: "   ", type: HabitType.DAILY, targetCount: 1, importance: 50 })],
  ["group", createGroupSchema.safeParse({ name: "   " })],
  ["label", createLabelSchema.safeParse({ name: "   " })],
] as const) {
  assert(!result.success, `${name} rejects a whitespace-only name`)
}

const normalizedTask = createTaskSchema.parse({ title: "  Ship it  ", importance: 50 })
assert(normalizedTask.title === "Ship it", "task titles are trimmed before storage")
