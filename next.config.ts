import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Uploads go through a server action (FormData). The default
  // server-action body limit is 1 MB; the library accepts files up
  // to the 50 MB Storage limit (see src/lib/storage.ts).
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
