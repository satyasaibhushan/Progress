export type CursorPaginationInput = {
  limitParam: string | null
  cursorParam: string | null
  minLimit?: number
  maxLimit?: number
  defaultLimit?: number
}

export type CursorPagination = {
  limit: number
  cursor: number
}

export function parseStrictIntegerParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function normalizeCursorPagination(input: CursorPaginationInput): CursorPagination {
  const minLimit = input.minLimit ?? 1
  const maxLimit = input.maxLimit ?? 100
  const defaultLimit = input.defaultLimit ?? 20

  const parsedLimit = parseStrictIntegerParam(input.limitParam ?? String(defaultLimit))
  const parsedCursor = parseStrictIntegerParam(input.cursorParam ?? "0")

  const limit = parsedLimit !== null
    ? Math.min(Math.max(parsedLimit, minLimit), maxLimit)
    : defaultLimit

  const cursor = parsedCursor !== null
    ? Math.max(parsedCursor, 0)
    : 0

  return { limit, cursor }
}

export type PaginationWindow<T> = {
  pageItems: T[]
  nextCursor: string | null
  start: number
  end: number
}

export function getPaginatedWindow<T>(
  items: T[],
  limit: number,
  cursor: number,
  options?: {
    highlightIndex?: number
  }
): PaginationWindow<T> {
  let start = Math.max(cursor, 0)
  if (typeof options?.highlightIndex === "number" && options.highlightIndex >= 0) {
    start = Math.floor(options.highlightIndex / limit) * limit
  }

  const end = Math.min(start + limit, items.length)
  const pageItems = items.slice(start, end)
  const nextCursor = end < items.length ? String(end) : null

  return {
    pageItems,
    nextCursor,
    start,
    end,
  }
}
