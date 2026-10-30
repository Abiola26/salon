/**
 * Shared TanStack Query keys — one namespace per resource so invalidations
 * reliably hit every list variant (public, admin, booking flow).
 */
export const queryKeys = {
  config: ["config"] as const,

  services: {
    /** Prefix key: invalidate this to refresh every services query. */
    all: ["services"] as const,
    list: () => ["services", "list"] as const,
    admin: () => ["services", "admin"] as const,
  },
};
