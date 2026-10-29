import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Browser requests to /api/* are proxied by this rewrite (the axios client
// uses baseURL "/api" in the browser). The target must be a server-side env
// var (BACKEND_URL) with safe defaults — never NEXT_PUBLIC_*, which once
// pointed this rewrite at /api-docs/ and served Swagger UI HTML as the API
// response. Keep the prod default in sync with the deployed backend.
const BACKEND_URL = (process.env.BACKEND_URL ||
  (isProd
    ? "https://salon-be-cvi2.onrender.com/api"
    : "http://localhost:5000/api")
).replace(/\/+$/, ""); // strip trailing slash

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
