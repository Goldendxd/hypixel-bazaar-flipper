/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Vercel — all data fetching is client-side so this is fine
  output: 'export',
  images: {
    // Allow external image domains used for item icons
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'sky.shiiyu.moe' },
      { protocol: 'https', hostname: 'sky.lea.moe' },
    ],
  },
}

module.exports = nextConfig
