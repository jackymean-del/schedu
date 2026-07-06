import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static export — served from Vercel like the Vite app, /api/* routed
  // to Railway via vercel.json (a platform-level rewrite, unaffected by this).
  output: "export",
};

export default nextConfig;
