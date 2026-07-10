import { z } from "zod"
import { isDateOnlyString } from "@/lib/date-only"

const dateInputSchema = z.string().refine((value) => {
  if (isDateOnlyString(value)) return true
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime())
}, "Invalid date")

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .default(50),
  progress: z
    .number()
    .min(0, "Progress must be at least 0")
    .max(100, "Progress must be at most 100")
    .default(0)
    .optional(), // Optional - only for leaf tasks, calculated for parent tasks
  startDate: dateInputSchema.optional().nullable(),
  deadline: dateInputSchema.optional().nullable(),
  groupId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().max(2000, "Description too long").optional().nullable(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .optional(),
  progress: z
    .number()
    .min(0, "Progress must be at least 0")
    .max(100, "Progress must be at most 100")
    .optional(), // Optional - only for leaf tasks, calculated for parent tasks
  startDate: dateInputSchema.optional().nullable(),
  deadline: dateInputSchema.optional().nullable(),
  groupId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
})
