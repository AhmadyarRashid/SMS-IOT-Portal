/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.SMS_IOT_BACKEND_URL ||
  process.env.OPENREMOTE_BACKEND_URL ||
  'https://go.smsiotpk.com';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendUrl}/api/:path*` },
      { source: '/auth/:path*', destination: `${backendUrl}/auth/:path*` },
      { source: '/websocket/:path*', destination: `${backendUrl}/websocket/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: '/activity', destination: '/live', permanent: false },
      { source: '/monitoring', destination: '/', permanent: false },
      { source: '/devices', destination: '/', permanent: false },
      { source: '/devices/:id', destination: '/a/:id', permanent: false },
      { source: '/history', destination: '/', permanent: false },
      { source: '/controls', destination: '/', permanent: false },
      { source: '/rules', destination: '/automations', permanent: false },
    ];
  },
};

export default nextConfig;