import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Closed beta: welcome modal on by default. Set NEXT_PUBLIC_BETA_WELCOME_ENABLED=0 to disable.
  env: {
    NEXT_PUBLIC_BETA_WELCOME_ENABLED:
      process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED ?? "1",
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
