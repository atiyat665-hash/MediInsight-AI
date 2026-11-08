/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Increase the body size limit for file uploads (20 MB + headroom)
    serverActions: {
      bodySizeLimit: '21mb',
    },
  },
}

export default nextConfig
