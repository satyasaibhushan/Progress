import { serializeHabit, serializeTask } from "@/lib/utils"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const serializedTask = serializeTask({
  id: "task",
  directGroupId: "direct-group",
  total_weight: BigInt(50),
}) as Record<string, unknown>

assertEqual(serializedTask.directGroupId, undefined, "task reconciliation metadata is private")
assertEqual(serializedTask.total_weight, "50", "task bigint fields remain serializable")

const serializedHabit = serializeHabit({
  id: "habit",
  directGroupId: "direct-group",
  startDate: new Date("2026-07-10T00:00:00.000Z"),
}) as Record<string, unknown>

assertEqual(serializedHabit.directGroupId, undefined, "habit reconciliation metadata is private")
assertEqual(serializedHabit.startDate, "2026-07-10", "habit dates remain date-only strings")
