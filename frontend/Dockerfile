# Multi-stage build for Next.js (Debian)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copia package files e instala dependencias (incluye dev para build)
COPY package*.json ./
RUN npm ci || npm install

# Copia el resto del código
COPY . .

# Construye la app (requiere output: 'standalone' en next.config)
RUN npm run build

# Production image (standalone)
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Crear usuario no root
RUN useradd -m -u 1001 nextjs

# Copiar artefactos necesarios desde el builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Permisos
RUN chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
