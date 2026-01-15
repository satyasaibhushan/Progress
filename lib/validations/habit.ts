import { z } from "zod"
import { HabitType } from "@prisma/client"

export const createHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  type: z.nativeEnum(HabitType, {
    errorMap: () => ({
      message: "Type must be DAILY, N_PER_DAY, WEEKLY, or MONTHLY",
    }),
  }),
  targetPerDay: z
    .number()
    .int()
    .positive("Target per day must be positive")
    .optional()
    .nullable(),
  endDate: z.string().datetime().optional().nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
})

export const updateHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().max(2000, "Description too long").optional().nullable(),
  type: z
    .nativeEnum(HabitType, {
      errorMap: () => ({
        message: "Type must be DAILY, N_PER_DAY, WEEKLY, or MONTHLY",
      }),
    })
    .optional(),
  targetPerDay: z
    .number()
    .int()
    .positive("Target per day must be positive")
    .optional()
    .nullable(),
  endDate: z.string().datetime().optional().nullable(),
  groupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
})

export const logHabitSchema = z.object({
  completedAt: z.string().datetime().optional(), // defaults to now if not provided
  count: z.number().int().positive().default(1), // for N_PER_DAY habits
})
