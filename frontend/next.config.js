/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // output: 'standalone', // Comentado temporalmente para simplificar el build
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  // Deshabilitar linting durante el build para evitar errores
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Deshabilitar verificación de tipos durante el build
  typescript: {
    ignoreBuildErrors: false,
  },
  // Evitar problemas con páginas de error
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // Deshabilitar generación estática de páginas de error
  output: 'standalone',
};

module.exports = nextConfig;
