/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // output: 'standalone', // Comentado - usar servidor normal para evitar problemas con archivos estáticos
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
};

module.exports = nextConfig;
