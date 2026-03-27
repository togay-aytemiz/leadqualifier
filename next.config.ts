import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const remoteImagePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
  {
    protocol: 'https',
    hostname: '**.supabase.co',
    pathname: '/storage/v1/object/public/**',
  },
  {
    protocol: 'https',
    hostname: '**.supabase.in',
    pathname: '/storage/v1/object/public/**',
  },
  {
    protocol: 'https',
    hostname: 'api.telegram.org',
    pathname: '/file/**',
  },
  {
    protocol: 'https',
    hostname: '**.fbcdn.net',
  },
  {
    protocol: 'https',
    hostname: '**.fbsbx.com',
  },
  {
    protocol: 'https',
    hostname: '**.facebook.com',
  },
  {
    protocol: 'https',
    hostname: '**.instagram.com',
  },
  {
    protocol: 'https',
    hostname: '**.cdninstagram.com',
  },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['iyzipay'],
  images: {
    remotePatterns: remoteImagePatterns,
  },
}

export default withNextIntl(nextConfig)
