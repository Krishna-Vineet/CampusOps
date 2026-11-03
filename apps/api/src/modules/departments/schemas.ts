import { z } from "zod";

export const createDepartmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only.")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(160),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
