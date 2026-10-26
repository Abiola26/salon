/**
 * Canonical site origin for SEO (metadataBase, robots, sitemap, JSON-LD).
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://your-app.vercel.app).
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

export const siteName = "Ottawa Loctician (IWA LOCZ)";
