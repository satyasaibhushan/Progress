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
        type: "WEEKLY",
        countPerPeriod: 5,
        maxCountPerDay: 1,
        activeDays: [2, 1, 4, 5, 6],
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

    assertEqual(metrics.streak, 7, "weekly streak: current partial week + previous complete week")
    assertEqual(metrics.streakPeriod, "DAILY", "weekly streak is returned in day/log unit")
    assertEqual(metrics.currentPeriodCount, 2, "weekly current period count remains period-based")
    assertEqual(metrics.currentPeriodTarget, 5, "weekly target uses countPerPeriod")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "WEEKLY",
        countPerPeriod: 5,
        maxCountPerDay: 1,
        activeDays: [2, 1, 4, 5, 6],
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
      { now: new Date("2026-02-12T12:00:00.000Z"), timeZone: "UTC" } // Thu active day, not logged
    )

    assertEqual(metrics.streak, 7, "weekly streak does not break on unlogged day in current open week")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "WEEKLY",
        countPerPeriod: 5,
      },
      [
        // Current week (2 logs)
        { date: "2026-02-11", count: 1 },
        { date: "2026-02-10", count: 1 },
        // Previous week (4 logs, below target 5)
        { date: "2026-02-07", count: 1 },
        { date: "2026-02-06", count: 1 },
        { date: "2026-02-05", count: 1 },
        { date: "2026-02-03", count: 1 },
      ],
      { now: new Date("2026-02-12T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 2, "weekly streak stops when first previous week misses countPerPeriod")
    assertEqual(metrics.streakPeriod, "DAILY", "weekly streak period label remains daily/log unit")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "WEEKLY",
        countPerPeriod: 5,
      },
      [
        // Current week (2 logs)
        { date: "2026-02-11", count: 1 },
        { date: "2026-02-10", count: 1 },
        // Week starting 2026-02-01 intentionally skipped (0 logs)
        // Older week has logs, should not be included
        { date: "2026-01-29", count: 1 },
        { date: "2026-01-27", count: 1 },
      ],
      { now: new Date("2026-02-12T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 2, "weekly streak breaks at first fully skipped week")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "WEEKLY",
        countPerPeriod: 5,
      },
      [
        // No logs in current (open) week
        // Previous two weeks are complete: 5 + 5
        { date: "2026-02-07", count: 1 },
        { date: "2026-02-06", count: 1 },
        { date: "2026-02-05", count: 1 },
        { date: "2026-02-04", count: 1 },
        { date: "2026-02-03", count: 1 },
        { date: "2026-01-31", count: 1 },
        { date: "2026-01-30", count: 1 },
        { date: "2026-01-29", count: 1 },
        { date: "2026-01-28", count: 1 },
        { date: "2026-01-27", count: 1 },
      ],
      { now: new Date("2026-02-12T12:00:00.000Z"), timeZone: "UTC" }
    )

    assertEqual(metrics.streak, 10, "weekly streak ignores empty current open week and continues with prior complete weeks")
  }

  {
    const metrics = calculateHabitPeriodMetrics(
      {
        type: "DAILY",
        maxCountPerDay: 1,
      },
      [
        { date: "2026-02-10", count: 1 },
        { date: "2026-02-09", count: 1 },
        { date: "2026-02-08", count: 1 },
        { date: "2026-02-07", count: 1 },
        { date: "2026-02-06", count: 1 },
        { date: "2026-02-05", count: 1 },
        { date: "2026-02-04", count: 1 },
        { date: "2026-02-03", count: 1 },
        { date: "2026-02-02", count: 1 },
        { date: "2026-02-01", count: 1 },
        { date: "2026-01-31", count: 1 },
      ],
      { now: new Date("2026-02-11T17:00:00.000Z"), timeZone: "America/Los_Angeles" }
    )

    assertEqual(metrics.streak, 11, "timezone-safe date-only streak does not drop to zero before today's log")
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
