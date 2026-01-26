import type { SubscriptionTier } from '../subscription/types';

export interface FeatureFlag {
    id: string;
    name: string;
    description: string | null;
    enabledTiers: SubscriptionTier[];
    enabledTenants: string[];
    rolloutPercentage: number;
    active: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface CreateFeatureFlagInput {
    name: string;
    description?: string;
    enabledTiers?: SubscriptionTier[];
    enabledTenants?: string[];
    rolloutPercentage?: number;
    active?: boolean;
}

export interface UpdateFeatureFlagInput {
    name?: string;
    description?: string | null;
    enabledTiers?: SubscriptionTier[];
    enabledTenants?: string[];
    rolloutPercentage?: number;
    active?: boolean;
}

export interface FeatureCheckContext {
    tenantId: string;
    tier?: SubscriptionTier;
}
