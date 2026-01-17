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
    .nullable(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .default(50),
  endDate: z.string().datetime().optional().nullable(),
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
    .nullable(),
  importance: z
    .number()
    .int()
    .min(1, "Importance must be at least 1")
    .max(100, "Importance must be at most 100")
    .optional(),
  endDate: z.string().datetime().optional().nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
})

export const logHabitSchema = z.object({
  date: z.string().datetime().optional(), // defaults to today if not provided
  count: z.number().int().positive().default(1), // for N_PER_DAY habits
})
