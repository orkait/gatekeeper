import { z } from 'zod';

export const CreateFeatureFlagSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    enabledTiers: z.array(z.enum(['free', 'pro', 'enterprise'])).optional(),
    enabledTenants: z.array(z.string()).optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional(),
});

export const UpdateFeatureFlagSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(),
    enabledTiers: z.array(z.enum(['free', 'pro', 'enterprise'])).optional(),
    enabledTenants: z.array(z.string()).optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional(),
});

export const CreateOverrideSchema = z.object({
    tenantId: z.string().min(1),
    type: z.enum(['quota_boost', 'tier_upgrade', 'feature_grant']),
    value: z.string().min(1),
    reason: z.string().min(1).max(1000),
    expiresInSeconds: z.number().int().positive().optional(),
});

export type CreateFeatureFlagInput = z.infer<typeof CreateFeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.infer<typeof UpdateFeatureFlagSchema>;
export type CreateOverrideInput = z.infer<typeof CreateOverrideSchema>;
