/**
 * Authentication Constants
 * Centralized configuration values for auth-related operations
 */

// User validation
export const MAX_NAME_LENGTH = 100;

// Security - Failed login tracking
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Token generation
export const REFRESH_TOKEN_LENGTH = 32;
export const EMAIL_VERIFICATION_TOKEN_LENGTH = 32;
export const EMAIL_VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Password hashing (PBKDF2)
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_LENGTH = 16;
export const PBKDF2_KEY_LENGTH = 256;

// JWKS caching
export const JWKS_CACHE_MAX_AGE_SECONDS = 3600; // 1 hour
export const JWKS_STALE_WHILE_REVALIDATE_SECONDS = 86400; // 24 hours
