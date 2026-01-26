import { z } from 'zod';

export const AuthorizeRequestSchema = z.object({
    action: z.string().min(1),
    resource: z.string().optional(),
    context: z.object({
        tenantId: z.string().min(1),
        service: z.string().min(1),
        sessionId: z.string().optional(),
        apiKeyId: z.string().optional(),
        requiredFeature: z.string().optional(),
        requiredRole: z.enum(['member', 'admin', 'owner']).optional(),
        quantity: z.number().int().positive().optional(),
    }),
});

export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;
