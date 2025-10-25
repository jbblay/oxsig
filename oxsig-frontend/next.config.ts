import type { NextConfig } from "next";
import path from "path";

// Use static export only for Tauri builds or when explicitly requested.
// Avoids Next "export-no-custom-routes" warning during normal web dev.
const isStaticExport =
  process.env.NEXT_OUTPUT === "export" ||
  process.env.TAURI === "1" ||
  process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const } : {}),

  // Set workspace root to silence lockfile warning
  outputFileTracingRoot: path.join(__dirname, ".."),

  // Disable image optimization for static export only
  ...(isStaticExport
    ? {
        images: { unoptimized: true as const },
      }
    : {}),

  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  // Headers (skip when static-exporting since custom headers aren't supported by export)
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-DNS-Prefetch-Control", value: "on" },
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
                { key: "X-XSS-Protection", value: "1; mode=block" },
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), microphone=(), geolocation=()",
                },
              ],
            },
            {
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
                { key: "Service-Worker-Allowed", value: "/" },
              ],
            },
            {
              source: "/manifest.webmanifest",
              headers: [
                { key: "Content-Type", value: "application/manifest+json" },
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ];
        },
      }),

  webpack: (config, { isServer }) => {
    if (process.env.NODE_ENV === "development") {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: "@dyad-sh/nextjs-webpack-component-tagger",
      });
    }

    // Only optimize client-side bundles (fix "exports is not defined" error)
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
      };
    }

    return config;
  },
};

export default nextConfig;
