import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const withPWAInit = require('next-pwa');

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
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

/** @type {import('next').NextConfig} */
const nextConfig = {
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
