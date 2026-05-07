/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'sky.shiiyu.moe' },
      { protocol: 'https', hostname: 'sky.lea.moe' },
      { protocol: 'https', hostname: 'mc.nether.pro' },
    ],
  },
}

module.exports = nextConfig
