import { z } from 'zod';

// Re-export schemas from main schema file
export {
    EmailSchema,
    PasswordSchema,
    NameSchema,
    SignupSchema,
    LoginSchema,
    GoogleAuthSchema,
    RefreshTokenSchema,
    UpdateUserSchema,
    type SignupInput,
    type LoginInput,
    type GoogleAuthInput,
    type RefreshTokenInput,
    type UpdateUserInput,
} from '../../schemas/auth.schema';

// Route-specific schemas
export const ValidateApiKeySchema = z.object({
    apiKey: z.string().min(1),
    service: z.string().min(1).optional(),
});

export const VerifyEmailSchema = z.object({
    token: z.string().min(1),
});

export const ResendVerificationSchema = z.object({
    email: z.string().email().max(255),
});

export type ValidateApiKeyInput = z.infer<typeof ValidateApiKeySchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;
