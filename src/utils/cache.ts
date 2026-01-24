/**
 * KV-based caching for auth decisions with D1 fallback support.
 * 
 * When D1 is unavailable, cached auth decisions can be returned to maintain
 * service availability. Cached responses include a `degraded: true` flag
 * to indicate potentially stale data.
 * 
 * Usage:
 *   const cache = createAuthCache(env.AUTH_CACHE);
 *   
 *   // Cache a successful auth decision
 *   await cache.set('session:sess_123', { userId: 'user_1', valid: true });
 *   
 *   // Try to get cached decision
 *   const cached = await cache.get<AuthDecision>('session:sess_123');
 */

/** Default TTL for cached auth decisions (60 seconds) */
export const AUTH_CACHE_TTL_SECONDS = 60;

/** Cache key prefixes for different auth types */
export const CacheKeyPrefix = {
    SESSION: 'session:',
    API_KEY: 'apikey:',
    AUTH_DECISION: 'auth:',
    USER: 'user:',
    TENANT: 'tenant:',
} as const;

/** Result of a cached auth operation */
export interface CachedResult<T> {
    data: T;
    /** Whether this result came from cache (potentially stale) */
    degraded: boolean;
    /** When the cached value was stored (ISO timestamp) */
    cachedAt?: string;
}

/** Wrapper for cache entry with metadata */
interface CacheEntry<T> {
    data: T;
    cachedAt: string;
}

/** Auth cache interface */
export interface AuthCache {
    /**
     * Store an auth decision in cache.
     * @param key - Cache key (use CacheKeyPrefix for consistency)
     * @param value - Data to cache
     * @param ttl - TTL in seconds (defaults to AUTH_CACHE_TTL_SECONDS)
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;

    /**
     * Retrieve a cached auth decision.
     * @param key - Cache key
     * @returns Cached value or null if not found/expired
     */
    get<T>(key: string): Promise<CacheEntry<T> | null>;

    /**
     * Delete a cached value.
     * @param key - Cache key
     */
    delete(key: string): Promise<void>;

    /**
     * Delete all cached values with a given prefix.
     * Note: This is an eventual operation due to KV limitations.
     * @param prefix - Key prefix to match
     */
    deleteByPrefix(prefix: string): Promise<void>;
}

/**
 * Creates a KV-backed auth cache.
 * 
 * @param kv - The KV namespace binding from Worker environment
 * @returns AuthCache instance
 */
export function createAuthCache(kv: KVNamespace): AuthCache {
    return {
        async set<T>(key: string, value: T, ttl: number = AUTH_CACHE_TTL_SECONDS): Promise<void> {
            const entry: CacheEntry<T> = {
                data: value,
                cachedAt: new Date().toISOString(),
            };
            await kv.put(key, JSON.stringify(entry), { expirationTtl: ttl });
        },

        async get<T>(key: string): Promise<CacheEntry<T> | null> {
            const raw = await kv.get(key, 'text');
            if (!raw) return null;
            
            try {
                return JSON.parse(raw) as CacheEntry<T>;
            } catch {
                // Invalid JSON, treat as missing
                return null;
            }
        },

        async delete(key: string): Promise<void> {
            await kv.delete(key);
        },

        async deleteByPrefix(prefix: string): Promise<void> {
            // KV list is eventually consistent and limited
            // This is best-effort for cache invalidation
            const list = await kv.list({ prefix, limit: 1000 });
            await Promise.all(list.keys.map((k) => kv.delete(k.name)));
        },
    };
}

/**
 * Higher-order function that wraps a database operation with cache fallback.
 * 
 * On success: caches the result and returns it
 * On D1 failure: returns cached result with degraded=true, or throws if no cache
 * 
 * @param cache - AuthCache instance
 * @param cacheKey - Key for caching
 * @param dbOperation - Async function that performs the DB operation
 * @param ttl - Cache TTL in seconds (optional)
 * @returns CachedResult with data and degraded flag
 * 
 * @example
 * ```typescript
 * const result = await withCacheFallback(
 *   cache,
 *   `session:${sessionId}`,
 *   () => db.first<Session>('SELECT * FROM sessions WHERE id = ?', [sessionId])
 * );
 * 
 * if (result.degraded) {
 *   console.warn('Using cached session data due to D1 outage');
 * }
 * ```
 */
export async function withCacheFallback<T>(
    cache: AuthCache,
    cacheKey: string,
    dbOperation: () => Promise<T>,
    ttl: number = AUTH_CACHE_TTL_SECONDS
): Promise<CachedResult<T>> {
    try {
        // Try the primary DB operation
        const data = await dbOperation();
        
        // Cache successful result (only cache truthy values)
        if (data !== null && data !== undefined) {
            await cache.set(cacheKey, data, ttl);
        }
        
        return { data, degraded: false };
    } catch (error) {
        // D1 operation failed - try cache fallback
        const cached = await cache.get<T>(cacheKey);
        
        if (cached) {
            // Return cached data with degraded flag
            return {
                data: cached.data,
                degraded: true,
                cachedAt: cached.cachedAt,
            };
        }
        
        // No cache available - rethrow the original error
        throw error;
    }
}

/**
 * Builds a cache key from components.
 * 
 * @example
 * buildCacheKey(CacheKeyPrefix.SESSION, tenantId, sessionId)
 * // Returns: "session:tenant_123:sess_456"
 */
export function buildCacheKey(...parts: string[]): string {
    return parts.join(':');
}

/**
 * Type guard to check if a result is degraded.
 */
export function isDegraded<T>(result: CachedResult<T>): boolean {
    return result.degraded === true;
}
