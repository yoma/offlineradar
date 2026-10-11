import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Welcome modal off by default now that the site is shared more widely.
  // Set NEXT_PUBLIC_BETA_WELCOME_ENABLED=1 to bring the "proefversie" popup back.
  env: {
    NEXT_PUBLIC_BETA_WELCOME_ENABLED:
      process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED ?? "0",
  },
  // Screenshots up to INTAKE_MAX_BYTES (4 MB) + multipart overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
