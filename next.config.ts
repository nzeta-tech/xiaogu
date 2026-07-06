import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  turbopack: process.env.NODE_ENV !== "production" ? {
    root: process.cwd(),
  } : undefined,
  serverExternalPackages: ["pg", "pg-cloudflare"],
};

export default nextConfig;
