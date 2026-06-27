import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api" || "https://salon-be-ogls.onrender.com/api"}/:path*`,
      },
    ];
  },
};

export default nextConfig;

