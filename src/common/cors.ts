const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

/**
 * Parse allowed CORS origins from the CORS_ORIGINS env var.
 * Comma-separated list, e.g. "https://app.example.com,https://admin.example.com".
 * Falls back to localhost dev origins when unset.
 */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return DEFAULT_ORIGINS;

  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : DEFAULT_ORIGINS;
}
