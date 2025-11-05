# Multi-stage build for Next.js frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Requisito común para Next/SWC en Alpine
RUN apk add --no-cache libc6-compat

# Copia package files e instala dependencias (incluye dev para build)
COPY package*.json ./
RUN npm ci || npm install

# Copia el resto del código
COPY . .

# Build (se asume output: 'standalone' en next.config)
RUN npm run build

# Production image (standalone)
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Compatibilidad para Next/SWC en Alpine
RUN apk add --no-cache libc6-compat

# Usuario no root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copiar artefactos necesarios desde el builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Permisos
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
