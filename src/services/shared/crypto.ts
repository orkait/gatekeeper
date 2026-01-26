const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Use rejection sampling for uniform distribution.
// 256 (byte range) is not divisible by 62, so using modulo creates bias.
// Values 0-247 map to 0-61 uniformly (248 = 62 * 4).
// Values 248-255 are in the biased range and must be resampled.
const MAX_UNBIASED_BYTE = 247; // 62 * 4 - 1

export function bytesToBase62(bytes: Uint8Array): string {
    const result: string[] = [];
    let i = 0;
    
    while (result.length < bytes.length) {
        if (i >= bytes.length) {
            // Need more random bytes - generate them
            const extraBytes = new Uint8Array(bytes.length - result.length);
            crypto.getRandomValues(extraBytes);
            for (const byte of extraBytes) {
                if (byte <= MAX_UNBIASED_BYTE) {
                    result.push(BASE62_CHARS[byte % 62]!);
                    if (result.length >= bytes.length) break;
                }
            }
            // If still not enough, loop will continue
            if (result.length >= bytes.length) break;
        } else {
            const byte = bytes[i]!;
            if (byte <= MAX_UNBIASED_BYTE) {
                // Unbiased range - use it
                result.push(BASE62_CHARS[byte % 62]!);
            }
            // else: biased range (248-255) - skip and get more bytes later
            i++;
        }
    }
    
    return result.join('');
}

export function generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

export async function hashSHA256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}


export function generateRandomToken(length: number = 32): string {
    const bytes = generateRandomBytes(length);
    return bytesToBase62(bytes);
}
