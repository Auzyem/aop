import type { NextConfig } from 'next';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const withPWAInit = require('next-pwa') as (
  opts: Record<string, unknown>,
) => (config: NextConfig) => NextConfig;

const withPWA = withPWAInit({
  dest: 'public',
  // Only enable service worker in production
  disable: process.env.NODE_ENV === 'development',
  // Cache agent routes for offline use
  runtimeCaching: [
    {
      urlPattern: /^https?.+\/agent\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'agent-pages',
        expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https?.+\/api\/transactions.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-transactions',
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@aop/types', '@aop/utils'],
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default withPWA(nextConfig);
