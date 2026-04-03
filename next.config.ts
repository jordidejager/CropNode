import { withSentryConfig } from "@sentry/nextjs";
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
  },
  async redirects() {
    return [
      // Dashboard
      { source: '/command-center', destination: '/dashboard', permanent: true },
      { source: '/command-center/timeline', destination: '/dashboard/tijdlijn', permanent: true },

      // Slimme Invoer
      { source: '/command-center/smart-input-v3', destination: '/slimme-invoer', permanent: true },
      { source: '/command-center/smart-input-v2', destination: '/slimme-invoer/v2', permanent: true },

      // Gewasbescherming
      { source: '/crop-care/logs', destination: '/gewasbescherming', permanent: true },
      { source: '/crop-care/fertilization', destination: '/gewasbescherming/bemesting', permanent: true },
      { source: '/crop-care/inventory', destination: '/gewasbescherming/voorraad', permanent: true },
      { source: '/crop-care/inventory/:path*', destination: '/gewasbescherming/voorraad/:path*', permanent: true },
      { source: '/crop-care/my-products', destination: '/gewasbescherming/producten', permanent: true },
      { source: '/crop-care/my-products/:path*', destination: '/gewasbescherming/producten/:path*', permanent: true },
      { source: '/crop-care/db-protection', destination: '/gewasbescherming/database', permanent: true },
      { source: '/crop-care/db-fertilizer', destination: '/gewasbescherming/database-meststoffen', permanent: true },

      // Percelen
      { source: '/parcels/list', destination: '/percelen', permanent: true },
      { source: '/parcels/map', destination: '/percelen/kaart', permanent: true },

      // Oogst & Opslag
      { source: '/harvest-hub/registration', destination: '/oogst', permanent: true },
      { source: '/harvest-hub/cold-storage', destination: '/oogst/koelcel', permanent: true },
      { source: '/harvest-hub/cold-storage/:path*', destination: '/oogst/koelcel/:path*', permanent: true },
      { source: '/harvest-hub/field-analysis', destination: '/percelen', permanent: true },
      { source: '/harvest-hub/quality', destination: '/oogst/sortering', permanent: true },
      { source: '/harvest-hub/deliveries', destination: '/oogst/aflevering', permanent: true },

      // Weer
      { source: '/weather', destination: '/weer', permanent: true },
      { source: '/weather/dashboard', destination: '/weer', permanent: true },
      { source: '/weather/historie', destination: '/weer/historie', permanent: true },
      { source: '/weather/disease-pressure', destination: '/analytics/ziektedruk', permanent: true },
      { source: '/weather/expert', destination: '/weer/forecast', permanent: true },
      { source: '/weather/season', destination: '/weer/historie', permanent: true },

      // Kennisbank / Research
      {
        source: '/research',
        has: [{ type: 'query', key: 'tab', value: 'papers' }],
        destination: '/kennisbank/papers',
        permanent: true,
      },
      {
        source: '/research',
        has: [{ type: 'query', key: 'tab', value: 'signals' }],
        destination: '/kennisbank',
        permanent: true,
      },
      { source: '/research', destination: '/kennisbank', permanent: true },
      { source: '/research/kennisbank', destination: '/kennisbank/artikelen', permanent: true },
      { source: '/research/kennisbank/:path*', destination: '/kennisbank/artikelen/:path*', permanent: true },
      { source: '/research/pests', destination: '/kennisbank', permanent: true },
      { source: '/research/pests/:path*', destination: '/kennisbank/ziekten-plagen/:path*', permanent: true },

      // Urenregistratie
      { source: '/team-tasks', destination: '/urenregistratie', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https' ,
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Upload source maps for readable stack traces
  silent: !process.env.CI,
  org: "de-jager-technology",
  project: "cropnode",

  // Route browser requests to avoid ad-blockers
  tunnelRoute: "/monitoring",

  // Hide source maps from users
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Automatically tree-shake Sentry logger
  disableLogger: true,
});

