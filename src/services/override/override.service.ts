import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs } from '../shared';
import type { 
    AdminOverride, 
    CreateOverrideInput, 
    OverrideType, 
    ParsedOverrides 
} from './types';

interface AdminOverrideRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    type: string;
    value: string;
    reason: string;
    granted_by: string;
    expires_at: number | null;
    created_at: number;
}

// OverrideService - Admin overrides for quota boosts, tier upgrades, feature grants.
// Overrides allow admins to grant temporary or permanent exceptions to normal
// subscription/quota rules for specific tenants.
export class OverrideService {
    constructor(private repository: AuthRepository) {}

    // ========================================================================
    // Override Retrieval
    // ========================================================================

    async getActiveOverrides(tenantId: string): Promise<ServiceResult<AdminOverride[]>> {
        const now = nowMs();

        const result = await this.repository.rawAll<AdminOverrideRow>(
            `SELECT * FROM admin_overrides 
             WHERE tenant_id = ? 
             AND (expires_at IS NULL OR expires_at > ?)
             ORDER BY created_at DESC`,
            [tenantId, now]
        );

        const overrides = result.results.map(this.mapRow);
        return ok(overrides);
    }

    async getParsedOverrides(tenantId: string): Promise<ServiceResult<ParsedOverrides>> {
        const result = await this.getActiveOverrides(tenantId);
        if (!result.success || !result.data) {
            return err(result.error as string);
        }

        const parsed: ParsedOverrides = {
            quotaBoost: null,
            tierUpgrade: null,
            featureGrants: [],
        };

        for (const override of result.data) {
            switch (override.type) {
                case 'quota_boost':
                    // Sum up all quota boosts
                    const boost = parseInt(override.value, 10);
                    if (!isNaN(boost)) {
                        parsed.quotaBoost = (parsed.quotaBoost ?? 0) + boost;
                    }
                    break;
                case 'tier_upgrade':
                    // Use the highest tier upgrade (enterprise > pro > free)
                    const tierOrder = { free: 0, pro: 1, enterprise: 2 };
                    const currentTier = parsed.tierUpgrade as keyof typeof tierOrder | null;
                    const newTier = override.value as keyof typeof tierOrder;
                    if (!currentTier || tierOrder[newTier] > tierOrder[currentTier]) {
                        parsed.tierUpgrade = override.value;
                    }
                    break;
                case 'feature_grant':
                    // Collect all granted features
                    if (!parsed.featureGrants.includes(override.value)) {
                        parsed.featureGrants.push(override.value);
                    }
                    break;
            }
        }

        return ok(parsed);
    }

    async getOverridesByType(
        tenantId: string,
        type: OverrideType
    ): Promise<ServiceResult<AdminOverride[]>> {
        const now = nowMs();

        const result = await this.repository.rawAll<AdminOverrideRow>(
            `SELECT * FROM admin_overrides 
             WHERE tenant_id = ? AND type = ?
             AND (expires_at IS NULL OR expires_at > ?)
             ORDER BY created_at DESC`,
            [tenantId, type, now]
        );

        const overrides = result.results.map(this.mapRow);
        return ok(overrides);
    }

    async hasFeatureGrant(tenantId: string, featureName: string): Promise<boolean> {
        const result = await this.getOverridesByType(tenantId, 'feature_grant');
        if (!result.success || !result.data) {
            return false;
        }

        return result.data.some(o => o.value === featureName);
    }

    async getQuotaBoost(tenantId: string): Promise<number> {
        const result = await this.getOverridesByType(tenantId, 'quota_boost');
        if (!result.success || !result.data) {
            return 0;
        }

        return result.data.reduce((sum, o) => {
            const boost = parseInt(o.value, 10);
            return isNaN(boost) ? sum : sum + boost;
        }, 0);
    }

    async getTierUpgrade(tenantId: string): Promise<string | null> {
        const result = await this.getOverridesByType(tenantId, 'tier_upgrade');
        if (!result.success || !result.data || result.data.length === 0) {
            return null;
        }

        // Return the highest tier
        const tierOrder = { free: 0, pro: 1, enterprise: 2 };
        let highestTier: string | null = null;
        let highestOrder = -1;

        for (const override of result.data) {
            const order = tierOrder[override.value as keyof typeof tierOrder] ?? -1;
            if (order > highestOrder) {
                highestOrder = order;
                highestTier = override.value;
            }
        }

        return highestTier;
    }

    // ========================================================================
    // CRUD Operations
    // ========================================================================

    async createOverride(input: CreateOverrideInput): Promise<ServiceResult<AdminOverride>> {
        const now = nowMs();

        const override: AdminOverride = {
            id: generateId('ov'),
            tenantId: input.tenantId,
            type: input.type,
            value: input.value,
            reason: input.reason,
            grantedBy: input.grantedBy,
            expiresAt: input.expiresInSeconds ? now + input.expiresInSeconds * 1000 : null,
            createdAt: now,
        };

        await this.repository.rawRun(
            `INSERT INTO admin_overrides (id, tenant_id, type, value, reason, granted_by, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                override.id,
                override.tenantId,
                override.type,
                override.value,
                override.reason,
                override.grantedBy,
                override.expiresAt,
                override.createdAt,
            ]
        );

        return ok(override);
    }

    async getOverride(id: string): Promise<ServiceResult<AdminOverride>> {
        const row = await this.repository.rawFirst<AdminOverrideRow>(
            'SELECT * FROM admin_overrides WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('Override not found');
        }

        return ok(this.mapRow(row));
    }

    async listOverrides(tenantId: string): Promise<ServiceResult<AdminOverride[]>> {
        const result = await this.repository.rawAll<AdminOverrideRow>(
            'SELECT * FROM admin_overrides WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const overrides = result.results.map(this.mapRow);
        return ok(overrides);
    }

    async deleteOverride(id: string): Promise<ServiceResult<void>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return err('Override not found');
        }

        await this.repository.rawRun(
            'DELETE FROM admin_overrides WHERE id = ?',
            [id]
        );

        return ok(undefined);
    }

    async revokeAllOverrides(tenantId: string): Promise<ServiceResult<number>> {
        const result = await this.repository.rawRun(
            'DELETE FROM admin_overrides WHERE tenant_id = ?',
            [tenantId]
        );

        return ok(result.changes ?? 0);
    }

    async expireOverride(id: string): Promise<ServiceResult<AdminOverride>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return err('Override not found');
        }

        await this.repository.rawRun(
            'UPDATE admin_overrides SET expires_at = ? WHERE id = ?',
            [nowMs(), id]
        );

        return this.getOverride(id);
    }

    async extendOverride(id: string, additionalSeconds: number): Promise<ServiceResult<AdminOverride>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return err('Override not found');
        }

        const currentExpires = existing.data.expiresAt ?? nowMs();
        const newExpires = currentExpires + additionalSeconds * 1000;

        await this.repository.rawRun(
            'UPDATE admin_overrides SET expires_at = ? WHERE id = ?',
            [newExpires, id]
        );

        return this.getOverride(id);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private mapRow(row: AdminOverrideRow): AdminOverride {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            type: row.type as OverrideType,
            value: row.value,
            reason: row.reason,
            grantedBy: row.granted_by,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        };
    }
}

// Create an OverrideService instance.
export function createOverrideService(repository: AuthRepository): OverrideService {
    return new OverrideService(repository);
}
