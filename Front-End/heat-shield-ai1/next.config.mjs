/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Disable Next.js dev overlay / dev indicators UI in development
  // This hides the built-in dev tools overlay (route, bundler, preferences, etc.)
  devIndicators: false,
}

export default nextConfig
