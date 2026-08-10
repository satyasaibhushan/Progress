import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel owns output tracing; self-hosted Docker builds use standalone output.
  output: process.env.VERCEL ? undefined : "standalone",
  experimental: {
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
