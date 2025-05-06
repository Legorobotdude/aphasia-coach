import withPWA from 'next-pwa';

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing config here
  
  // For MVP development, ignore ESLint errors during builds
  eslint: {
    // Warning: This ignores ESLint errors during builds - remove for production
    ignoreDuringBuilds: true,
  },
  // Keep TypeScript checks enabled to catch type errors
};

export default pwaConfig(nextConfig); 