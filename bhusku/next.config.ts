import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static export, served from Vercel. /api/* is routed to Railway via
  // vercel.json (platform rewrite) so the contact form reaches the same backend
  // the schedU sites use.
  output: "export",
};

export default nextConfig;
