import { z } from 'zod';

// Tenant role enum
export const TenantRoleSchema = z.enum(['owner', 'admin', 'member']);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

// Create tenant input
export const CreateTenantSchema = z.object({
    name: z.string().min(1).max(255),
    globalQuotaLimit: z.number().int().positive().nullable().optional(),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

// Update tenant input
export const UpdateTenantSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    globalQuotaLimit: z.number().int().positive().nullable().optional(),
});
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

// Tenant response
export const TenantSchema = z.object({
    id: z.string(),
    name: z.string(),
    globalQuotaLimit: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type TenantOutput = z.infer<typeof TenantSchema>;
