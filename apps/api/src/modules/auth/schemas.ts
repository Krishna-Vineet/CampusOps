import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const clientSchema = z.enum(["web", "mobile"]).default("web");
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "OTP must be 6 digits.");

export const registerCollegeSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  institutionName: z.string().trim().min(2).max(160),
  rollNumber: z.string().trim().min(1).max(40),
  departmentId: z.string().uuid(),
  program: z.string().trim().max(120).optional(),
  graduationYear: z.number().int().min(2000).max(2100).optional(),
  collegeIdNumber: z.string().trim().min(1, "College ID number is required.").max(60),
  client: clientSchema,
});

export const registerOutsiderSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  institutionName: z.string().trim().min(2).max(160),
  program: z.string().trim().max(120).optional(),
  graduationYear: z.number().int().min(2000).max(2100).optional(),
  client: clientSchema,
});

export const verifyEmailSchema = z.union([
  z.object({ token: z.string().min(20).max(200) }),
  z.object({ challengeId: z.string().uuid(), otp: otpSchema }),
]);
export const resendVerificationSchema = z.object({ email: emailSchema });
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  client: clientSchema,
  deviceLabel: z.string().max(120).optional(),
});
export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
  client: clientSchema,
});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.union([
  z.object({ token: z.string().min(20).max(200), newPassword: passwordSchema }),
  z.object({ email: emailSchema, otp: otpSchema, newPassword: passwordSchema }),
]);
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
