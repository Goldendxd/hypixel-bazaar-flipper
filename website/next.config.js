/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'sky.shiiyu.moe', pathname: '/api/item/**' },
      { protocol: 'https', hostname: 'sky.lea.moe', pathname: '/api/item/**' },
    ],
  },
}

module.exports = nextConfig
