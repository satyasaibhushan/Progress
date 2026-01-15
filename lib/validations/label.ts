import { z } from "zod"

export const createLabelSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  color: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i, "Invalid hex color").optional(),
})

export const updateLabelSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long").optional(),
  color: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i, "Invalid hex color").optional().nullable(),
})
