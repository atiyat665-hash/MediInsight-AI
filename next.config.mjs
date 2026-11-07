/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14 key for packages that must not be bundled by webpack.
    // (Renamed to top-level `serverExternalPackages` in Next.js 15.)
    serverComponentsExternalPackages: [
      'tesseract.js',
      'pdf-parse',
      'pdf-lib',
      'pdfjs-dist',
      'sharp',
      '@napi-rs/canvas',
    ],

    // Increase the body size limit for file uploads (20 MB + headroom)
    serverActions: {
      bodySizeLimit: '21mb',
    },
  },

  webpack(config, { isServer }) {
    if (isServer) {
      // Tell webpack not to bundle the worker scripts.
      // Both are spawned as child processes at runtime and must remain as
      // plain files on disk so they can import pdfjs-dist, @napi-rs/canvas,
      // and tesseract.js from node_modules without path mangling.
      const existingExternals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : []

      config.externals = [
        ...existingExternals,
        (ctx, callback) => {
          if (
            ctx.request &&
            (ctx.request.includes('ocr-worker') ||
             ctx.request.includes('pdf-to-images-worker'))
          ) {
            return callback(null, `commonjs ${ctx.request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
}

export default nextConfig
