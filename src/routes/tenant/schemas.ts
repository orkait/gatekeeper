import { z } from 'zod';
import { TenantRoleSchema } from '../../schemas/tenant.schema';

export { CreateTenantSchema, UpdateTenantSchema, TenantRoleSchema } from '../../schemas/tenant.schema';

export const AddUserSchema = z.object({
    userId: z.string().min(1),
    role: TenantRoleSchema,
});

export const UpdateUserRoleSchema = z.object({
    role: TenantRoleSchema,
});

export type AddUserInput = z.infer<typeof AddUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
