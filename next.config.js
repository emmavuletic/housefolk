/** @type {import('next').NextConfig} */

const CSP = [
  "default-src 'self'",
  // Scripts: self + inline (needed for housefolk.js inline handlers) + Google Fonts
  "script-src 'self' 'unsafe-inline'",
  // Styles: self + inline + Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' https://fonts.gstatic.com",
  // Images: self + Supabase storage + data URIs
  "img-src 'self' data: blob: https://*.supabase.co",
  // API calls: self + Supabase + Stripe + Resend
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com",
  // Stripe JS (for checkout)
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  // No plugins, no objects
  "object-src 'none'",
  // Prevent framing (clickjacking)
  "frame-ancestors 'none'",
  // Upgrade insecure requests in production
  "upgrade-insecure-requests",
].join('; ')

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
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
