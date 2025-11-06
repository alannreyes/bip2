/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // output: 'standalone', // Comentado temporalmente para simplificar el build
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  // Deshabilitar generación estática de páginas de error
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  // Evitar problemas con páginas de error
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;
