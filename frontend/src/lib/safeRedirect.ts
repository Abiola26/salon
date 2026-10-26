/**
 * Validates a user-supplied redirect target.
 * Only same-site absolute paths are allowed to prevent open redirects
 * (`https://evil.com`, `//evil.com`, `/\evil.com` are rejected).
 */
export function safeRedirect(
  raw: string | null | undefined,
  fallback: string
): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }
  return fallback;
}
