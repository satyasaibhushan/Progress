import { logHabitSchema } from "@/lib/validations/habit"

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function runHabitLogSchemaTests(): void {
  const dateOnly = logHabitSchema.safeParse({ date: "2026-02-11", count: 1 })
  assert(dateOnly.success, "date-only log date should parse")

  const isoDate = logHabitSchema.safeParse({ date: "2026-02-11T00:00:00.000Z", count: 1 })
  assert(isoDate.success, "iso datetime log date should parse")

  const invalidDate = logHabitSchema.safeParse({ date: "not-a-date", count: 1 })
  assert(!invalidDate.success, "invalid date should fail")
}

runHabitLogSchemaTests()
