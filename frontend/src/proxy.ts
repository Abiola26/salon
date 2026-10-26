import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection (Phase 2; migrated to the Next 16 `proxy` convention).
 *
 * The refresh session lives in an httpOnly cookie (`salon_refresh`), so this
 * server-side proxy is the first place a navigation can know whether the
 * browser has a session — something localStorage-based auth never could.
 *
 * This gates UI shells only; every API call is still authenticated by the
 * backend (Bearer access token + server-side session revocation).
 */

const REFRESH_COOKIE = "salon_refresh";

interface SessionClaims {
  id?: string;
  role?: string;
  exp?: number;
}

const base64UrlToText = (part: string): string => {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
};

/**
 * HS256-verify the refresh JWT with WebCrypto — edge-safe, no jsonwebtoken.
 * Returns null for invalid/expired tokens.
 */
const verifySession = async (token: string): Promise<SessionClaims | null> => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    const expected = btoa(
      Array.from(new Uint8Array(signature))
        .map((b) => String.fromCharCode(b))
        .join("")
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (expected !== parts[2]) return null;

    const claims = JSON.parse(base64UrlToText(parts[1])) as SessionClaims;
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(REFRESH_COOKIE)?.value ?? null;
  const hasSecret = Boolean(process.env.JWT_REFRESH_SECRET);

  // With JWT_REFRESH_SECRET configured: signature+expiry verified.
  // Without it: fall back to cookie presence (UI gating only — the API
  // still enforces real auth) so a missing env var never locks anyone out.
  const claims = token ? await verifySession(token) : null;
  const hasSession = token !== null && (hasSecret ? claims !== null : true);

  const requireSession = () => {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  };

  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
    if (!hasSession) return requireSession();
    if (hasSecret && pathname.startsWith("/admin") && claims?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // /login, /register — a signed-in user doesn't need them
  if (hasSession) {
    const fallback = claims?.role === "ADMIN" ? "/admin" : "/dashboard";
    const rawRedirect = req.nextUrl.searchParams.get("redirect");
    const target =
      rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.startsWith("/\\")
        ? rawRedirect
        : fallback;
    return NextResponse.redirect(new URL(target, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/login", "/register"],
};
