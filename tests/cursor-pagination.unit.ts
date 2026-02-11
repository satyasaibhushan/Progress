import { getPaginatedWindow, normalizeCursorPagination } from "@/lib/server/pagination/cursor"

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function runCursorPaginationTests(): void {
  const pagination = normalizeCursorPagination({
    limitParam: "20",
    cursorParam: "0",
  })
  assertEqual(pagination.limit, 20, "limit parses as integer")
  assertEqual(pagination.cursor, 0, "cursor parses as integer")

  const fallbackPagination = normalizeCursorPagination({
    limitParam: "invalid",
    cursorParam: "invalid",
  })
  assertEqual(fallbackPagination.limit, 20, "invalid limit falls back")
  assertEqual(fallbackPagination.cursor, 0, "invalid cursor falls back")

  const items = Array.from({ length: 95 }, (_, index) => ({ id: index }))

  const highlightedPage = getPaginatedWindow(items, 20, 0, {
    highlightIndex: 45,
  })
  assertEqual(highlightedPage.start, 40, "highlight uses page start")
  assertEqual(highlightedPage.end, 60, "highlight uses page end")
  assertEqual(highlightedPage.pageItems[0].id, 40, "highlight page starts from matching bucket")
  assertEqual(highlightedPage.nextCursor, "60", "highlight next cursor points to page end")

  const cursorPage = getPaginatedWindow(items, 20, 20)
  assertEqual(cursorPage.start, 20, "cursor paging start")
  assertEqual(cursorPage.pageItems[0].id, 20, "cursor page first item")
}

runCursorPaginationTests()
