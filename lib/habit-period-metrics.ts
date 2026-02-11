type HabitType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

type HabitLike = {
  type: HabitType;
  countPerPeriod?: number | null;
  maxCountPerDay?: number | null;
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

function dayKeyFromDateOnly(date: Date): string {
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function dayKeyToEpochDay(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function dayKeyToWeekday(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function epochDayToDayKey(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY);
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function weekKeyFromDayKey(dayKey: string): string {
  const epochDay = dayKeyToEpochDay(dayKey);
  const startOfWeekEpochDay = epochDay - dayKeyToWeekday(dayKey);
  return epochDayToDayKey(startOfWeekEpochDay);
}

function getPeriodKeyFromDayKey(type: HabitType, dayKey: string): string {
  if (type === "DAILY") return dayKey;
  if (type === "WEEKLY") return weekKeyFromDayKey(dayKey);
  if (type === "YEARLY") return dayKey.slice(0, 4);
  return dayKey.slice(0, 7);
}

function getPreviousPeriodKey(type: HabitType, currentKey: string): string {
  if (type === "YEARLY") {
    return String(Number.parseInt(currentKey, 10) - 1);
  }

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

function getDailyActiveDaySet(activeDays: number[] | null | undefined): Set<number> {
  const normalized = (activeDays || [])
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  if (normalized.length === 0) {
    return new Set<number>([0, 1, 2, 3, 4, 5, 6]);
  }
  return new Set<number>(normalized);
}

function getPreviousScheduledDayKey(
  fromDayKey: string,
  activeDays: Set<number>,
  includeCurrent: boolean
): string {
  let epochDay = dayKeyToEpochDay(fromDayKey);
  if (!includeCurrent) {
    epochDay -= 1;
  }

  while (true) {
    const dayKey = epochDayToDayKey(epochDay);
    if (activeDays.has(dayKeyToWeekday(dayKey))) {
      return dayKey;
    }
    epochDay -= 1;
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
  const maxCountPerDay = Math.max(1, habit.maxCountPerDay || 1);
  const periodTarget = type === "DAILY" ? maxCountPerDay : countPerPeriod;

  const startDate = getValidDate(habit.startDate);
  const endDate = getValidDate(habit.endDate);
  const startDayKey = startDate ? dayKeyFromDateOnly(startDate) : null;
  const endDayKey = endDate ? dayKeyFromDateOnly(endDate) : null;
  const todayDayKey = dayKeyFromDate(now, timeZone);
  const referenceDayKey = endDayKey && endDayKey < todayDayKey ? endDayKey : todayDayKey;
  const currentPeriodKey = getPeriodKeyFromDayKey(type, referenceDayKey);
  const currentDayKey = referenceDayKey;

  const dailyCounts = new Map<string, number>();
  const periodCounts = new Map<string, number>();
  const weeklyDistinctDays = new Map<string, Set<string>>();

  for (const log of logs) {
    const logDate = getValidDate(log.date);
    if (!logDate) continue;

    const dayKey = dayKeyFromDateOnly(logDate);
    if (startDayKey && dayKey < startDayKey) continue;
    if (endDayKey && dayKey > endDayKey) continue;

    const count = Number.isFinite(log.count) ? log.count : 0;
    if (count <= 0) continue;

    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + count);

    const periodKey = getPeriodKeyFromDayKey(type, dayKey);
    periodCounts.set(periodKey, (periodCounts.get(periodKey) || 0) + count);

    const weekKey = weekKeyFromDayKey(dayKey);
    const distinct = weeklyDistinctDays.get(weekKey) || new Set<string>();
    distinct.add(dayKey);
    weeklyDistinctDays.set(weekKey, distinct);
  }

  const getPeriodCount = (periodKey: string): number => {
    return periodCounts.get(periodKey) || 0;
  };

  const isPeriodComplete = (periodKey: string): boolean => {
    return getPeriodCount(periodKey) >= periodTarget;
  };

  const currentPeriodCount = getPeriodCount(currentPeriodKey);
  const currentPeriodComplete = isPeriodComplete(currentPeriodKey);
  const currentWeeklyDistinctDays = type === "WEEKLY"
    ? weeklyDistinctDays.get(currentPeriodKey)?.size || 0
    : 0;

  let streak = 0;
  let streakPeriod: HabitType = type;
  const usesScheduledDayStreak = (habit.activeDays?.length || 0) > 0;
  if (type === "WEEKLY") {
    streakPeriod = "DAILY";
    const lowerBoundWeekKey = startDayKey ? getPeriodKeyFromDayKey("WEEKLY", startDayKey) : null;
    const referenceWeekKey = getPeriodKeyFromDayKey("WEEKLY", referenceDayKey);
    const todayWeekKey = getPeriodKeyFromDayKey("WEEKLY", todayDayKey);
    const isCurrentOpenWeek = referenceWeekKey === todayWeekKey && (!endDayKey || endDayKey >= todayDayKey);
    const currentWeekCount = getPeriodCount(referenceWeekKey);

    let streakWeekKey = referenceWeekKey;
    if (isCurrentOpenWeek && currentWeekCount <= 0) {
      streakWeekKey = getPreviousPeriodKey("WEEKLY", referenceWeekKey);
    }

    while (true) {
      if (lowerBoundWeekKey && streakWeekKey < lowerBoundWeekKey) break;
      const weekCount = getPeriodCount(streakWeekKey);
      if (weekCount <= 0) break;
      streak += weekCount;
      streakWeekKey = getPreviousPeriodKey("WEEKLY", streakWeekKey);
    }
  } else if (usesScheduledDayStreak) {
    streakPeriod = "DAILY";
    const activeDaySet = getDailyActiveDaySet(habit.activeDays);
    const todayIsScheduled = activeDaySet.has(dayKeyToWeekday(currentDayKey));
    const todayHasProgress = (dailyCounts.get(currentDayKey) || 0) >= 1;
    const includeToday = !todayIsScheduled || todayHasProgress;
    let streakDayKey = getPreviousScheduledDayKey(currentDayKey, activeDaySet, includeToday);

    while (true) {
      if (startDayKey && streakDayKey < startDayKey) break;
      if ((dailyCounts.get(streakDayKey) || 0) < 1) break;
      streak += 1;
      streakDayKey = getPreviousScheduledDayKey(streakDayKey, activeDaySet, false);
    }
  } else {
    streakPeriod = type;
    const lowerBoundPeriodKey = startDayKey ? getPeriodKeyFromDayKey(type, startDayKey) : null;
    let streakKey = currentPeriodComplete ? currentPeriodKey : getPreviousPeriodKey(type, currentPeriodKey);

    while (true) {
      if (lowerBoundPeriodKey && streakKey < lowerBoundPeriodKey) break;
      if (!isPeriodComplete(streakKey)) break;
      streak += 1;
      streakKey = getPreviousPeriodKey(type, streakKey);
    }
  }

  return {
    streak,
    streakPeriod,
    currentPeriodCount,
    currentPeriodTarget: periodTarget,
    currentPeriodComplete,
    weeklyDistinctDays: currentWeeklyDistinctDays,
  };
}
