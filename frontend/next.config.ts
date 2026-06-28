import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const DEFAULT_API_URL = isProd
  ? "https://salon-be-ogls.onrender.com/api"
  : "http://localhost:5000/api";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;

