import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.158"],
  // pdf-parse needs its worker/canvas files bundled as-is on Vercel serverless.
  // anki-apkg-export has an unreachable browser-only require("script-loader!sql.js")
  // that webpack still tries to resolve statically; keep it external so Node
  // requires it directly instead of bundling.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "anki-apkg-export", "sql.js"],
};

export default nextConfig;
