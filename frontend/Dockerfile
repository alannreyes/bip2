# Stage 1: Builder (Next.js)
FROM node:20 AS builder

WORKDIR /app

# Dependencias para build (dev incluidas)
COPY package*.json ./
RUN npm ci || npm install

# Código fuente
COPY . .

# Build (requiere next.config con output: 'standalone')
RUN npm run build

# Stage 2: Runtime (standalone, ligero)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiamos artefactos standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copiar public si existe (crear directorio primero)
RUN mkdir -p ./public
COPY --from=builder --chown=node:node /app/public ./public/

# Permisos para el usuario 'node'
RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
