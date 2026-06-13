import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Proxy all /api/* and /ws/* requests to the FastAPI backend
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/ws/:path*",  destination: `${BACKEND}/ws/:path*` },
    ];
  },
};

export default nextConfig;
