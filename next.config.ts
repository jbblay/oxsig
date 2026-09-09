import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  // Keep operational failures visible even when external monitoring is unavailable.
  compiler: { removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false },
  experimental: { optimizePackageImports: ['lucide-react', 'framer-motion'] },
  // ws optionally loads native addons; bundling them can replace bufferutil with
  // a stub and crash on the first masked browser frame (unmask is not a function).
  serverExternalPackages: ['ably', 'ws', 'bufferutil', 'utf-8-validate'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
      ],
    }];
  },
};

const sentrySourceMapsConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
);

export default sentrySourceMapsConfigured
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;

