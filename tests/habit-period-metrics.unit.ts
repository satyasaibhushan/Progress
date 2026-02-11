import { calculateHabitPeriodMetrics } from "@/lib/habit-period-metrics"

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function runHabitPeriodMetricsUnitTests(): void {
  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "DAILY",
        maxCountPerDay: 2,
        countPerPeriod: 1,
        activeDays: [2, 1, 4, 5, 6], // Tue, Mon, Thu, Fri, Sat
        startDate: "2026-01-12",
      },
      [
        { date: "2026-02-10", count: 1 },
        { date: "2026-02-09", count: 1 },
        { date: "2026-02-07", count: 1 },
        { date: "2026-02-06", count: 1 },
        { date: "2026-02-05", count: 1 },
        { date: "2026-02-03", count: 1 },
        { date: "2026-02-02", count: 1 },
      ],
      { now: new Date("2026-02-11T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 7, "daily scheduled-day streak")
    assertEqual(metrics.currentPeriodCount, 0, "daily current day count for unscheduled day")
    assertEqual(metrics.currentPeriodTarget, 2, "daily target uses maxCountPerDay")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "DAILY",
        maxCountPerDay: 3,
        activeDays: [1, 2, 3, 4, 5, 6, 0],
      },
      [{ date: "2026-02-11", count: 1 }],
      { now: new Date("2026-02-11T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 1, "daily streak counts any progress")
    assertEqual(metrics.currentPeriodComplete, false, "daily completion requires maxCountPerDay")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "WEEKLY",
        countPerPeriod: 5,
        maxCountPerDay: 3,
      },
      [
        { date: "2026-02-09", count: 3 },
        { date: "2026-02-10", count: 2 },
      ],
      { now: new Date("2026-02-11T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.currentPeriodCount, 5, "weekly period count uses total log count")
    assertEqual(metrics.currentPeriodComplete, true, "weekly period completion by total log count")
    assertEqual(metrics.weeklyDistinctDays, 2, "weekly distinct day count is tracked")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "YEARLY",
        countPerPeriod: 2,
      },
      [
        { date: "2026-01-10", count: 1 },
        { date: "2026-03-10", count: 1 },
        { date: "2025-02-10", count: 2 },
        { date: "2024-02-10", count: 1 },
      ],
      { now: new Date("2026-12-31T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 2, "yearly streak across consecutive completed years")
  }
}

runHabitPeriodMetricsUnitTests()
