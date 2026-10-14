import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.158"],
  // pdf-parse needs its worker/canvas files bundled as-is on Vercel serverless,
  // and kuromoji (the Japanese word splitter) loads its dictionary from disk.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "kuromoji"],
  // kuromoji's dictionary files are read at runtime, so ship them with the
  // server routes that split Japanese text.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/kuromoji/dict/**"],
  },
};

export default nextConfig;
