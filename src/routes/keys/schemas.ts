import { z } from 'zod';

export const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(255).optional(),
    scopes: z.array(z.string()).optional(),
    quotaLimit: z.number().int().positive().optional(),
    quotaPeriod: z.enum(['hour', 'day', 'month']).optional(),
    expiresInSeconds: z.number().int().positive().optional(),
});

export const UpdateApiKeySchema = z.object({
    name: z.string().min(1).max(255).optional(),
    scopes: z.array(z.string()).optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof UpdateApiKeySchema>;
