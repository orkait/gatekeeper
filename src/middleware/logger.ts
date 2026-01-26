import type { Context, Next } from "hono";

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';


export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    requestId: string;
    message: string;
    [key: string]: unknown;
}


export interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

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

    const requestId = c.req.header('x-request-id') || generateRequestId();

    const logger = createLogger(requestId, {
        method: c.req.method,
        path: c.req.path,
        userAgent: c.req.header('user-agent'),
    });

    c.set('logger', logger);
    c.set('requestId', requestId);

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

    if (status >= 500) {
        logger.error('Request completed with server error', { status, duration });
    } else if (status >= 400) {
        logger.warn('Request completed with client error', { status, duration });
    } else {
        logger.info('Request completed', { status, duration });
    }

    c.res.headers.set('x-request-id', requestId);
}

export function getLogger(c: Context): Logger {
    const logger = c.get('logger') as Logger | undefined;
    if (!logger) {
        throw new Error('Logger not found in context');
    }
    return logger;
}

export function getRequestId(c: Context): string {
    return (c.get('requestId') as string) || 'unknown';
}

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
