const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_REGEX.test(value)
}

export function parseDateInputToUTCDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (isDateOnlyString(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    0,
    0,
    0,
    0
  ))
}

export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`
}

