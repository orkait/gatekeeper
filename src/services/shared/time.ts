// Shared time utilities.

// Get current timestamp in milliseconds.
export function nowMs(): number {
    return Date.now();
}

// Get current timestamp in seconds (Unix timestamp).
export function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

// Check if a timestamp has expired.
export function isExpired(expiresAt: number): boolean {
    return expiresAt < Date.now();
}

// Calculate expiry timestamp from now + seconds.
export function expiresIn(seconds: number): number {
    return Date.now() + seconds * 1000;
}
