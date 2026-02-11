import { z } from "zod"
import { HabitType } from "@prisma/client"
import { isDateOnlyString } from "@/lib/date-only"

const dateInputSchema = z.string().refine((value) => {
  if (isDateOnlyString(value)) return true
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime())
}, "Invalid date")

export const createHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  type: z.nativeEnum(HabitType),
  targetCount: z
    .number()
    .int()
    .positive("Target count must be positive"),
  countPerPeriod: z
    .number()
    .int()
    .positive("Count per period must be positive")
    .optional(),
  maxCountPerDay: z
    .number()
    .int()
    .positive("Max count per day must be positive")
    .default(1)
    .optional(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .default(50),
  startDate: dateInputSchema.optional().nullable(),
  endDate: dateInputSchema.optional().nullable(),
  activeDays: z
    .array(z.number().int().min(0).max(6)) // 0=Sun, 1=Mon, ..., 6=Sat
    .optional()
    .nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  if (data.type !== HabitType.DAILY && data.countPerPeriod === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Count per period is required for weekly, monthly, and yearly habits",
      path: ["countPerPeriod"],
    })
  }
})

export const updateHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().max(2000, "Description too long").optional().nullable(),
  type: z.nativeEnum(HabitType).optional(),
  targetCount: z
    .number()
    .int()
    .positive("Target count must be positive")
    .optional()
    .nullable(),
  countPerPeriod: z
    .number()
    .int()
    .positive("Count per period must be positive")
    .optional(),
  maxCountPerDay: z
    .number()
    .int()
    .positive("Max count per day must be positive")
    .optional(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .optional(),
  startDate: dateInputSchema.optional().nullable(),
  endDate: dateInputSchema.optional().nullable(),
  activeDays: z
    .array(z.number().int().min(0).max(6)) // 0=Sun, 1=Mon, ..., 6=Sat
    .optional()
    .nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
})

// Form schema that works for both create and edit (makes certain fields optional for editing)
export const habitFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  type: z.nativeEnum(HabitType),
  targetCount: z
    .number()
    .int()
    .positive("Target count must be positive"),
  countPerPeriod: z
    .number()
    .int()
    .positive("Count per period must be positive")
    .optional(),
  maxCountPerDay: z
    .number()
    .int()
    .positive("Max count per day must be positive")
    .default(1)
    .optional(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .default(50)
    .optional(),
  startDate: dateInputSchema.optional().nullable(),
  endDate: dateInputSchema.optional().nullable(),
  activeDays: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  if (data.type !== HabitType.DAILY && data.countPerPeriod === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Count per period is required for weekly, monthly, and yearly habits",
      path: ["countPerPeriod"],
    })
  }
})

export const logHabitSchema = z.object({
  date: z.string().datetime().optional(), // defaults to today if not provided
  count: z.number().int().positive().default(1), // number of times logged
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(), // client timezone offset from UTC
})
