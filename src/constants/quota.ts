/**
 * Quota Service Constants
 * Configuration values for usage tracking and quota management
 */

// Quota buffer to prevent race condition overages (99% of limit)
export const QUOTA_BUFFER_PERCENTAGE = 0.99;

// Default pagination limits for usage events
export const DEFAULT_USAGE_EVENTS_LIMIT = 100;
export const DEFAULT_USAGE_EVENTS_OFFSET = 0;
