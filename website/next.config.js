/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'sky.shiiyu.moe' },
      { protocol: 'https', hostname: 'sky.lea.moe' },
    ],
  },
}

module.exports = nextConfig
