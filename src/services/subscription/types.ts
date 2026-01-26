export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';

export interface Subscription {
    id: string;
    tenantId: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    currentPeriodEnd: number;
    createdAt: number;
    updatedAt: number;
    cancelledAt: number | null;
}

export interface SubscriptionWithItems extends Subscription {
    items: SubscriptionItem[];
}

export interface SubscriptionItem {
    id: string;
    subscriptionId: string;
    service: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface CreateSubscriptionInput {
    tenantId: string;
    tier?: SubscriptionTier;
    periodDays?: number;
}

export interface UpdateSubscriptionInput {
    tier?: SubscriptionTier;
    status?: SubscriptionStatus;
    periodDays?: number;
}
