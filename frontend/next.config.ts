import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ['10.111.241.118'],
  // Proxy API requests to backend — phone/browser only needs to reach port 3000
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:8002/api/:path*' },
      { source: '/static/:path*', destination: 'http://localhost:8002/static/:path*' },
    ];
  },
};

export default nextConfig;
