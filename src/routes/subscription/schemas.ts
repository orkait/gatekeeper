import { z } from 'zod';

export const UpgradeSubscriptionSchema = z.object({
    tier: z.enum(['free', 'pro', 'enterprise']),
});

export const RecordUsageSchema = z.object({
    tenantId: z.string().min(1),
    apiKeyId: z.string().optional(),
    userId: z.string().optional(),
    service: z.string().min(1),
    action: z.string().min(1),
    quantity: z.number().int().positive().optional().default(1),
    idempotencyKey: z.string().min(1),
});

export type UpgradeSubscriptionInput = z.infer<typeof UpgradeSubscriptionSchema>;
export type RecordUsageInput = z.infer<typeof RecordUsageSchema>;
