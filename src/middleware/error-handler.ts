import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export interface ErrorResponse {
    success: false;
    error: string;
    details?: unknown;
    timestamp: string;
    path: string;
}

export function errorHandler(err: Error, c: Context): Response {
    const timestamp = new Date().toISOString();
    const path = c.req.path;

    if (err instanceof HTTPException) {
        return c.json<ErrorResponse>(
            { success: false, error: err.message, timestamp, path },
            err.status
        );
    }

    if (err instanceof ZodError) {
        return c.json<ErrorResponse>(
            {
                success: false,
                error: "Validation failed",
                details: err.errors.map(e => ({ path: e.path, message: e.message })),
                timestamp,
                path,
            },
            400
        );
    }

    console.error("Unhandled error:", err);

    return c.json<ErrorResponse>(
        { success: false, error: "Internal server error", timestamp, path },
        500
    );
}
