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

// ============================================================================
// Tenant-User Schemas
// ============================================================================

// Add user to tenant input
export const AddUserToTenantSchema = z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    role: TenantRoleSchema,
});
export type AddUserToTenantInput = z.infer<typeof AddUserToTenantSchema>;

// Update tenant user role input
export const UpdateTenantUserRoleSchema = z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    role: TenantRoleSchema,
});
export type UpdateTenantUserRoleInput = z.infer<typeof UpdateTenantUserRoleSchema>;

// Remove user from tenant input
export const RemoveUserFromTenantSchema = z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
});
export type RemoveUserFromTenantInput = z.infer<typeof RemoveUserFromTenantSchema>;

// Tenant user response
export const TenantUserSchema = z.object({
    tenantId: z.string(),
    userId: z.string(),
    role: TenantRoleSchema,
    createdAt: z.number(),
});
export type TenantUserOutput = z.infer<typeof TenantUserSchema>;
