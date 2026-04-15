/**
 * UUID validation utility.
 * Provides a shared regex for validating UUID format (RFC 4122).
 *
 * NOTE: This is a relaxed UUID regex that accepts any hex values.
 * For version-specific UUIDs (e.g., v4), use a dedicated regex.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
