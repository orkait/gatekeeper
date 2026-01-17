import { z } from "zod";

export const EmailSchema = z.string().email().max(255);
export const PasswordSchema = z.string().min(8).max(128);
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
