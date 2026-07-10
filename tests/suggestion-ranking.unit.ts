import { filterUnderAchievedItems } from "@/lib/suggestion-algorithm"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const suggestions = filterUnderAchievedItems([
  { id: "behind", progressGap: 10 },
  { id: "on-track", progressGap: 0 },
  { id: "ahead", progressGap: -10 },
  { id: "invalid", progressGap: Number.NaN },
])

assertEqual(suggestions.length, 1, "only under-achieved items are suggested")
assertEqual(suggestions[0]?.id, "behind", "the behind-schedule item remains eligible")
