/**
 * Standardized Error Messages
 * Centralized error messages for consistent user-facing errors
 */

export const ERROR_MESSAGES = {
    // Authentication errors
    AUTH: {
        INVALID_CREDENTIALS: 'Invalid email or password',
        EMAIL_ALREADY_REGISTERED: 'Email already registered',
        INVALID_TOKEN: 'Invalid or expired token',
        INVALID_REFRESH_TOKEN: 'Invalid refresh token',
        REFRESH_TOKEN_EXPIRED: 'Refresh token expired',
        INVALID_GOOGLE_TOKEN: 'Invalid Google token',
        TOO_MANY_FAILED_ATTEMPTS: 'Too many failed login attempts. Please try again later',
        EMAIL_NOT_VERIFIED: 'Email not verified',
        EMAIL_ALREADY_VERIFIED: 'Email already verified',
        VERIFICATION_TOKEN_EXPIRED: 'Verification token has expired',
        INVALID_VERIFICATION_TOKEN: 'Invalid or expired verification token',
    },

    // User errors
    USER: {
        NOT_FOUND: 'User not found or suspended',
        SUSPENDED: 'User account is suspended',
        NOT_IN_TENANT: 'User is not a member of this tenant',
    },

    // Tenant errors
    TENANT: {
        NOT_FOUND: 'Tenant not found',
        ALREADY_EXISTS: 'Tenant already exists',
        INVALID_SLUG: 'Invalid tenant slug',
    },

    // API Key errors
    API_KEY: {
        NOT_FOUND: 'API key not found',
        INVALID: 'Invalid API key',
        REVOKED: 'API key has been revoked',
        EXPIRED: 'API key has expired',
    },

    // Session errors
    SESSION: {
        NOT_FOUND: 'Session not found',
        INVALID: 'Invalid session',
        EXPIRED: 'Session expired',
        REVOKED: 'Session has been revoked',
    },

    // Subscription errors
    SUBSCRIPTION: {
        NOT_FOUND: 'Subscription not found',
        INACTIVE: 'Subscription is not active',
        SERVICE_DISABLED: 'Service is not enabled for this subscription',
    },

    // Quota errors
    QUOTA: {
        EXCEEDED: 'Quota limit exceeded',
        CONCURRENT_REQUESTS: 'Quota exceeded due to concurrent requests',
    },

    // Authorization errors
    AUTHORIZATION: {
        INSUFFICIENT_ROLE: 'Insufficient permissions',
        FEATURE_DISABLED: 'Feature is not enabled',
        INTERNAL_ERROR: 'Authorization check failed',
    },

    // Webhook errors
    WEBHOOK: {
        NOT_FOUND: 'Webhook not found',
        DELIVERY_FAILED: 'Webhook delivery failed',
        INVALID_URL: 'Invalid webhook URL',
    },

    // Validation errors
    VALIDATION: {
        FAILED: 'Validation failed',
        INVALID_INPUT: 'Invalid input',
        MISSING_PARAMETER: 'Missing required parameter',
    },

    // Generic errors
    GENERIC: {
        INTERNAL_ERROR: 'Internal server error',
        NOT_FOUND: 'Resource not found',
        UNAUTHORIZED: 'Unauthorized',
        FORBIDDEN: 'Forbidden',
        BAD_REQUEST: 'Bad request',
        SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
    },

    // Email errors
    EMAIL: {
        SERVICE_NOT_CONFIGURED: 'Email service not configured',
        SEND_FAILED: 'Failed to send email',
        VERIFICATION_SENT: 'Verification email sent',
        VERIFICATION_SENT_IF_EXISTS: 'If the email exists, a verification link has been sent',
    },

    // Success messages
    SUCCESS: {
        EMAIL_VERIFIED: 'Email verified successfully',
        LOGOUT: 'Logged out successfully',
        CREATED: 'Resource created successfully',
        UPDATED: 'Resource updated successfully',
        DELETED: 'Resource deleted successfully',
    },
} as const;
