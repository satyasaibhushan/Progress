type HabitType = "DAILY" | "WEEKLY" | "MONTHLY";

type HabitLike = {
  type: HabitType;
  countPerPeriod?: number | null;
  activeDays?: number[] | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

type HabitLogLike = {
  date: Date | string;
  count: number;
};

export type HabitPeriodMetrics = {
  streak: number;
  streakPeriod: HabitType;
  currentPeriodCount: number;
  currentPeriodTarget: number;
  currentPeriodComplete: boolean;
  weeklyDistinctDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function getValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);

  let year = 0;
  let month = 0;
  let day = 0;
  let weekdayText = "Sun";

  for (const part of parts) {
    if (part.type === "year") year = Number.parseInt(part.value, 10);
    else if (part.type === "month") month = Number.parseInt(part.value, 10);
    else if (part.type === "day") day = Number.parseInt(part.value, 10);
    else if (part.type === "weekday") weekdayText = part.value;
  }

  const weekday = WEEKDAY_TO_INDEX[weekdayText] ?? 0;
  return { year, month, day, weekday };
}

function dayKeyFromDate(date: Date, timeZone: string): string {
  const parts = getLocalDateParts(date, timeZone);
  return toDayKey(parts.year, parts.month, parts.day);
}

function monthKeyFromDate(date: Date, timeZone: string): string {
  const parts = getLocalDateParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}`;
}

function dayKeyToEpochDay(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function epochDayToDayKey(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY);
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function weekKeyFromDate(date: Date, timeZone: string): string {
  const parts = getLocalDateParts(date, timeZone);
  const epochDay = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
  const startOfWeekEpochDay = epochDay - parts.weekday;
  return epochDayToDayKey(startOfWeekEpochDay);
}

function getPeriodKeyFromDate(type: HabitType, date: Date, timeZone: string): string {
  if (type === "DAILY") return dayKeyFromDate(date, timeZone);
  if (type === "WEEKLY") return weekKeyFromDate(date, timeZone);
  return monthKeyFromDate(date, timeZone);
}

function getPreviousPeriodKey(type: HabitType, currentKey: string): string {
  if (type === "MONTHLY") {
    const [year, month] = currentKey.split("-").map(Number);
    const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
    return `${previousMonthDate.getUTCFullYear()}-${pad2(previousMonthDate.getUTCMonth() + 1)}`;
  }

  const stepDays = type === "WEEKLY" ? 7 : 1;
  const previousEpochDay = dayKeyToEpochDay(currentKey) - stepDays;
  return epochDayToDayKey(previousEpochDay);
}

function normalizeTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

export function calculateHabitPeriodMetrics(
  habit: HabitLike,
  logs: HabitLogLike[],
  options?: { now?: Date; timeZone?: string | null }
): HabitPeriodMetrics {
  const type = habit.type;
  const timeZone = normalizeTimeZone(options?.timeZone);
  const now = getValidDate(options?.now ?? new Date()) || new Date();
  const countPerPeriod = Math.max(1, habit.countPerPeriod || 1);
  const weeklyTarget = Math.max(1, (habit.activeDays?.length || 0) > 0 ? habit.activeDays!.length : countPerPeriod);
  const periodTarget = type === "WEEKLY" ? weeklyTarget : countPerPeriod;

  const startDate = getValidDate(habit.startDate);
  const endDate = getValidDate(habit.endDate);
  const startDayKey = startDate ? dayKeyFromDate(startDate, timeZone) : null;
  const endDayKey = endDate ? dayKeyFromDate(endDate, timeZone) : null;

  const referenceDate = endDate && endDate.getTime() < now.getTime() ? endDate : now;
  const currentPeriodKey = getPeriodKeyFromDate(type, referenceDate, timeZone);

  const dailyCounts = new Map<string, number>();
  const weeklyAgg = new Map<string, { count: number; distinctDays: Set<string> }>();
  const monthlyCounts = new Map<string, number>();

  for (const log of logs) {
    const logDate = getValidDate(log.date);
    if (!logDate) continue;

    const dayKey = dayKeyFromDate(logDate, timeZone);
    if (startDayKey && dayKey < startDayKey) continue;
    if (endDayKey && dayKey > endDayKey) continue;

    const count = Number.isFinite(log.count) ? log.count : 0;
    if (count <= 0) continue;

    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + count);

    const weekKey = weekKeyFromDate(logDate, timeZone);
    const weekEntry = weeklyAgg.get(weekKey) || { count: 0, distinctDays: new Set<string>() };
    weekEntry.count += count;
    weekEntry.distinctDays.add(dayKey);
    weeklyAgg.set(weekKey, weekEntry);

    const monthKey = monthKeyFromDate(logDate, timeZone);
    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + count);
  }

  const getPeriodCount = (periodKey: string): number => {
    if (type === "DAILY") return dailyCounts.get(periodKey) || 0;
    if (type === "WEEKLY") return weeklyAgg.get(periodKey)?.distinctDays.size || 0;
    return monthlyCounts.get(periodKey) || 0;
  };

  const isPeriodComplete = (periodKey: string): boolean => {
    return getPeriodCount(periodKey) >= periodTarget;
  };

  const currentPeriodCount = getPeriodCount(currentPeriodKey);
  const currentPeriodComplete = isPeriodComplete(currentPeriodKey);
  const currentWeeklyDistinctDays = weeklyAgg.get(currentPeriodKey)?.distinctDays.size || 0;

  const lowerBoundPeriodKey = startDate ? getPeriodKeyFromDate(type, startDate, timeZone) : null;
  let streak = 0;
  let streakKey = currentPeriodComplete ? currentPeriodKey : getPreviousPeriodKey(type, currentPeriodKey);

  while (true) {
    if (lowerBoundPeriodKey && streakKey < lowerBoundPeriodKey) break;
    if (!isPeriodComplete(streakKey)) break;
    streak += 1;
    streakKey = getPreviousPeriodKey(type, streakKey);
  }

  return {
    streak,
    streakPeriod: type,
    currentPeriodCount,
    currentPeriodTarget: periodTarget,
    currentPeriodComplete,
    weeklyDistinctDays: currentWeeklyDistinctDays,
  };
}
