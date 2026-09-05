import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: { removeConsole: process.env.NODE_ENV === 'production' },
  experimental: { optimizePackageImports: ['lucide-react', 'framer-motion'] },
  serverExternalPackages: ['ably'],
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

export default nextConfig;
