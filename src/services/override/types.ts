export type OverrideType = 'quota_boost' | 'tier_upgrade' | 'feature_grant';

export interface AdminOverride {
    id: string;
    tenantId: string;
    type: OverrideType;
    value: string;
    reason: string;
    grantedBy: string;
    expiresAt: number | null;
    createdAt: number;
}

export interface CreateOverrideInput {
    tenantId: string;
    type: OverrideType;
    value: string;
    reason: string;
    grantedBy: string;
    expiresInSeconds?: number;
}

export interface ParsedOverrides {
    quotaBoost: number | null;
    tierUpgrade: string | null;
    featureGrants: string[];
}
