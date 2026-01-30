/**
 * API Key Constants
 * Configuration values for API key generation and validation
 */

// API key format: oka_live_<random_base62_string>
export const API_KEY_PREFIX = 'oka_live_';

// Number of random bytes to generate for API key
export const API_KEY_RANDOM_BYTES = 32;

// Length of the key prefix to display (for identification)
export const API_KEY_PREFIX_DISPLAY_LENGTH = 8;
