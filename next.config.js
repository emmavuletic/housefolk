/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/post',
        destination: '/post.html',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
