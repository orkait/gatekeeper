/**
 * Centralized Logging Utility
 * Provides structured logging with consistent format across the application
 */

export interface LogContext {
    requestId?: string;
    [key: string]: unknown;
}

export interface LogEntry {
    timestamp: string;
    level: 'error' | 'warn' | 'info';
    message: string;
    requestId?: string;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    context?: LogContext;
}

class Logger {
    private formatLog(entry: LogEntry): string {
        return JSON.stringify(entry);
    }

    error(message: string, error?: Error | unknown, context?: LogContext): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            message,
            requestId: context?.requestId,
            context,
        };

        if (error instanceof Error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        } else if (error) {
            entry.error = {
                name: 'Unknown',
                message: String(error),
            };
        }

        console.error(this.formatLog(entry));
    }

    warn(message: string, context?: LogContext): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message,
            requestId: context?.requestId,
            context,
        };

        console.warn(this.formatLog(entry));
    }

    info(message: string, context?: LogContext): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'info',
            message,
            requestId: context?.requestId,
            context,
        };

        console.log(this.formatLog(entry));
    }
}

export const logger = new Logger();
