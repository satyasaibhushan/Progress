import { parseDateString } from "@/lib/utils"

const longRangeDate = `${new Date().getFullYear() + 5}-01-15`
if (!parseDateString(longRangeDate)) {
  throw new Error("valid long-range planning dates must not be rejected")
}
