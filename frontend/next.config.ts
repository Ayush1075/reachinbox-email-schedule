import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server output for the production Docker image.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The dashboard is behind a session cookie and fills in from client queries, so there is
    // no static content to navigate into instantly; validate only segments that opt in.
    instantInsights: { validationLevel: 'manual-warning' },
  },
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
