import { prisma } from "@/lib/prisma";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Normalize an API date input to a calendar-day key. Date-only values are
 * preserved literally; datetimes are converted using the supplied timezone.
 * Impossible date-only values return null instead of being normalized by
 * JavaScript's Date parser (for example, 2026-02-30).
 */
export function getDateKeyFromInput(
  value: string | undefined,
  timeZone: string,
): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    return parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day
      ? trimmed
      : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return getDateKeyInTimeZone(parsed, timeZone);
}

export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone && isValidTimeZone(user.timezone) ? user.timezone : "UTC";
  } catch {
    return "UTC";
  }
}
