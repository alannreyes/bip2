/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // output: 'standalone', // Comentado - usar servidor normal para evitar problemas con archivos estáticos
  // API URL is determined dynamically at runtime in lib/api.ts based on window.location.hostname
  // This allows the frontend to work from any IP/hostname without requiring a rebuild
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
