import assert from "node:assert/strict"
import test from "node:test"
import {
  isDateOnlyString,
  parseDateInputToUTCDate,
} from "../lib/date-only"

test("date-only parsing rejects impossible calendar dates", () => {
  assert.equal(isDateOnlyString("2026-02-29"), false)
  assert.equal(isDateOnlyString("2024-02-29"), true)
  assert.equal(isDateOnlyString("2026-04-31"), false)
  assert.equal(parseDateInputToUTCDate("2026-02-29"), null)
})

test("date-only parsing preserves a valid calendar date at UTC midnight", () => {
  assert.equal(
    parseDateInputToUTCDate("2026-07-10")?.toISOString(),
    "2026-07-10T00:00:00.000Z"
  )
})
