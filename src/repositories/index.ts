/**
 * Repository exports.
 *
 * Repositories provide typed database access with strong consistency
 * for auth-critical operations.
 */

export { AuthRepository } from './auth.repository';
export type {
    // Row types (for advanced use cases)
    UserRow,
    TenantRow,
    TenantUserRow,
    SessionRow,
    RefreshTokenRow,
    // Domain types
    Tenant,
    TenantUser,
    TenantRole,
    Session,
    // Batch operation types
    BatchStatement,
} from './auth.repository';
