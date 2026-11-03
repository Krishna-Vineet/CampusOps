import { z } from "zod";

export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const verifySchema = z.object({ note: z.string().trim().max(500).optional() });
export const profilePatchSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    institutionName: z.string().trim().min(2).max(160).optional(),
    rollNumber: z.string().trim().min(1).max(40).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    program: z.string().trim().max(120).nullable().optional(),
    graduationYear: z.number().int().min(2000).max(2100).nullable().optional(),
    collegeIdNumber: z.string().trim().max(60).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });
