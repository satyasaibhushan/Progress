import { z } from "zod"
import { HabitType } from "@/lib/generated/prisma"

export const createHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  type: z.nativeEnum(HabitType),
  targetCount: z
    .number()
    .int()
    .positive("Target count must be positive")
    .optional()
    .nullable(), // Can be auto-calculated from endDate
  countPerPeriod: z
    .number()
    .int()
    .positive("Count per period must be positive")
    .default(1)
    .optional(), // How many times per day/week/month
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .default(50),
  endDate: z.string().datetime().optional().nullable(),
  activeDays: z
    .array(z.number().int().min(0).max(6)) // 0=Sun, 1=Mon, ..., 6=Sat
    .optional()
    .nullable(), // Required for WEEKLY habits, optional for others
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
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
    .nullable(), // Can be auto-calculated from endDate
  countPerPeriod: z
    .number()
    .int()
    .positive("Count per period must be positive")
    .optional(), // How many times per day/week/month
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .optional(),
  endDate: z.string().datetime().optional().nullable(),
  activeDays: z
    .array(z.number().int().min(0).max(6)) // 0=Sun, 1=Mon, ..., 6=Sat
    .optional()
    .nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
})

export const logHabitSchema = z.object({
  date: z.string().datetime().optional(), // defaults to today if not provided
  count: z.number().int().positive().default(1), // number of times logged
})
