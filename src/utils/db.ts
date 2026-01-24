/**
 * Strong consistency wrapper for D1 database operations.
 * 
 * All auth-path reads MUST use this wrapper to prevent stale data issues
 * that could lead to security vulnerabilities (e.g., using revoked tokens/keys).
 * 
 * This wrapper uses D1 sessions to ensure sequential consistency for
 * related queries. For single queries, it reads from the primary replica.
 * 
 * Usage:
 *   const db = createAuthDB(env.DB);
 *   const user = await db.first<User>('SELECT * FROM users WHERE id = ?', [userId]);
 */

/** Query result types */
export interface QueryResult<T> {
    results: T[];
    success: boolean;
    meta: D1Meta;
}

export interface D1Meta {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
}

/** Row type constraint - must be a record/object */
type Row = Record<string, unknown>;

/**
 * Auth-safe D1 database wrapper that enforces consistency on all reads.
 * Use this for all auth-critical operations (sessions, tokens, keys, etc.)
 */
export interface AuthDB {
    /**
     * Execute a query and return the first matching row.
     * Uses sequential consistency to ensure fresh data.
     */
    first<T extends Row>(sql: string, params?: unknown[]): Promise<T | null>;

    /**
     * Execute a query and return all matching rows.
     * Uses sequential consistency to ensure fresh data.
     */
    all<T extends Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

    /**
     * Execute a write query (INSERT, UPDATE, DELETE).
     * Returns metadata about the operation.
     */
    run(sql: string, params?: unknown[]): Promise<D1Meta>;

    /**
     * Execute multiple queries in a batch/transaction.
     * All queries run atomically with sequential consistency.
     */
    batch<T extends Row[]>(statements: { sql: string; params?: unknown[] }[]): Promise<QueryResult<T[number]>[]>;

    /**
     * Execute a read query within a session for sequential consistency.
     * Use this when you need to read data that may have just been written.
     */
    firstInSession<T extends Row>(sql: string, params?: unknown[]): Promise<T | null>;

    /**
     * Get the underlying D1Database for advanced operations.
     * Prefer the wrapper methods when possible.
     */
    raw(): D1Database;
}

/**
 * Creates an auth-safe D1 wrapper that enforces consistency.
 * 
 * @param db - The D1Database binding from the Worker environment
 * @returns AuthDB wrapper with consistency guarantees
 * 
 * @example
 * ```typescript
 * const db = createAuthDB(env.DB);
 * 
 * // Single row query
 * const user = await db.first<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
 * 
 * // Multiple rows query
 * const { results } = await db.all<SessionRow>('SELECT * FROM sessions WHERE user_id = ?', [userId]);
 * 
 * // Write operation
 * await db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', [expiresAt, sessionId]);
 * 
 * // Batch operation (atomic)
 * await db.batch([
 *   { sql: 'INSERT INTO sessions ...', params: [...] },
 *   { sql: 'INSERT INTO refresh_tokens ...', params: [...] },
 * ]);
 * ```
 */
export function createAuthDB(db: D1Database): AuthDB {
    // Create a session for sequential consistency
    // first-primary ensures we hit the primary replica for fresh data
    const session = db.withSession('first-primary');

    return {
        async first<T extends Row>(sql: string, params: unknown[] = []): Promise<T | null> {
            const stmt = session.prepare(sql);
            const bound = params.length > 0 ? stmt.bind(...params) : stmt;
            return bound.first<T>();
        },

        async all<T extends Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
            const stmt = session.prepare(sql);
            const bound = params.length > 0 ? stmt.bind(...params) : stmt;
            const result = await bound.all<T>();
            return {
                results: result.results,
                success: result.success,
                meta: result.meta as D1Meta,
            };
        },

        async run(sql: string, params: unknown[] = []): Promise<D1Meta> {
            const stmt = session.prepare(sql);
            const bound = params.length > 0 ? stmt.bind(...params) : stmt;
            const result = await bound.run();
            return result.meta as D1Meta;
        },

        async batch<T extends Row[]>(
            statements: { sql: string; params?: unknown[] }[]
        ): Promise<QueryResult<T[number]>[]> {
            const prepared = statements.map(({ sql, params = [] }) => {
                const stmt = session.prepare(sql);
                return params.length > 0 ? stmt.bind(...params) : stmt;
            });
            
            const results = await session.batch(prepared);
            return results.map((result) => ({
                results: result.results as T[number][],
                success: result.success,
                meta: result.meta as D1Meta,
            }));
        },

        async firstInSession<T extends Row>(sql: string, params: unknown[] = []): Promise<T | null> {
            // Uses the same session for read-after-write consistency
            const stmt = session.prepare(sql);
            const bound = params.length > 0 ? stmt.bind(...params) : stmt;
            return bound.first<T>();
        },

        raw(): D1Database {
            return db;
        },
    };
}

/**
 * Type helper for extracting row type from a query result.
 * Useful when building repository methods.
 */
export type ExtractRow<T> = T extends QueryResult<infer R> ? R : never;
