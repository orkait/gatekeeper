import type { Context, Next } from "hono";

/**
 * Log levels.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry.
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    requestId: string;
    message: string;
    [key: string]: unknown;
}

/**
 * Logger interface for structured logging.
 */
export interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}

/**
 * Log level priority for filtering.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Create a structured logger instance.
 */
export function createLogger(
    requestId: string,
    context: Record<string, unknown> = {},
    minLevel: LogLevel = 'info'
): Logger {
    const minPriority = LOG_LEVEL_PRIORITY[minLevel];

    const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
        if (LOG_LEVEL_PRIORITY[level] < minPriority) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            requestId,
            message,
            ...context,
            ...data,
        };

        // Output as JSON
        console.log(JSON.stringify(entry));
    };

    return {
        debug: (message, data) => log('debug', message, data),
        info: (message, data) => log('info', message, data),
        warn: (message, data) => log('warn', message, data),
        error: (message, data) => log('error', message, data),
        child: (childContext) => createLogger(requestId, { ...context, ...childContext }, minLevel),
    };
}

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Request logger middleware with structured JSON logging.
 * 
 * - Adds x-request-id header (or uses existing one)
 * - Creates a logger instance attached to the context
 * - Logs request start and completion
 */
export async function requestLogger(c: Context, next: Next) {
    const start = Date.now();
    
    // Get or generate request ID
    const requestId = c.req.header('x-request-id') || generateRequestId();
    
    // Create logger with request context
    const logger = createLogger(requestId, {
        method: c.req.method,
        path: c.req.path,
        userAgent: c.req.header('user-agent'),
    });

    // Attach logger and requestId to context
    c.set('logger', logger);
    c.set('requestId', requestId);

    // Log request start
    logger.info('Request started', {
        query: Object.fromEntries(new URL(c.req.url).searchParams),
    });

    try {
        await next();
    } catch (error) {
        const duration = Date.now() - start;
        logger.error('Request failed with exception', {
            duration,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
    }

    const duration = Date.now() - start;
    const status = c.res.status;

    // Log request completion
    if (status >= 500) {
        logger.error('Request completed with server error', { status, duration });
    } else if (status >= 400) {
        logger.warn('Request completed with client error', { status, duration });
    } else {
        logger.info('Request completed', { status, duration });
    }

    // Add request ID to response headers
    c.res.headers.set('x-request-id', requestId);
}

/**
 * Get logger from context.
 */
export function getLogger(c: Context): Logger {
    const logger = c.get('logger') as Logger | undefined;
    if (!logger) {
        // Fallback logger if middleware wasn't applied
        return createLogger('unknown');
    }
    return logger;
}

/**
 * Get request ID from context.
 */
export function getRequestId(c: Context): string {
    return (c.get('requestId') as string) || 'unknown';
}

/**
 * Log an authorization decision.
 */
export function logAuthDecision(
    logger: Logger,
    decision: {
        allowed: boolean;
        reason: string;
        userId?: string;
        tenantId?: string;
        action?: string;
        resource?: string;
        metadata?: Record<string, unknown>;
    }
): void {
    const { allowed, reason, ...context } = decision;

    if (allowed) {
        logger.info('Authorization granted', { allowed, reason, ...context });
    } else {
        logger.warn('Authorization denied', { allowed, reason, ...context });
    }
}

/**
 * Log an access denied event with details.
 */
export function logAccessDenied(
    logger: Logger,
    details: {
        reason: string;
        userId?: string;
        tenantId?: string;
        resource?: string;
        action?: string;
        ip?: string;
    }
): void {
    logger.warn('Access denied', {
        event: 'access_denied',
        ...details,
    });
}

/**
 * Log a security event.
 */
export function logSecurityEvent(
    logger: Logger,
    event: string,
    details: Record<string, unknown>
): void {
    logger.warn('Security event', {
        event,
        ...details,
    });
}
