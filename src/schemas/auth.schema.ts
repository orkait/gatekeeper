import { z } from "zod";

export const EmailSchema = z.string().email().max(255);

// Password requirements:
// - Minimum 12 characters (NIST recommends 8+ but 12 is more secure)
// - Maximum 128 characters
// - At least one uppercase letter
// - At least one lowercase letter  
// - At least one number
export const PasswordSchema = z.string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number");

export const NameSchema = z.string().min(1).max(100);

export const SignupSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
    name: NameSchema.optional(),
});

export const LoginSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});

export const GoogleAuthSchema = z.object({
    idToken: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
});

export const UpdateUserSchema = z.object({
    name: NameSchema.optional(),
    avatarUrl: z.string().url().optional(),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type GoogleAuthInput = z.infer<typeof GoogleAuthSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
