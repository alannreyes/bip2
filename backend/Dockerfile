# Stage 1: Builder (Debian)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Herramientas para compilar dependencias nativas (mysql2/pg/node-gyp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=development

# Copiar package files primero para cache
COPY package*.json ./

# Instalar dependencias (usa ci si hay lock; fallback a install con legacy peer deps)
RUN npm ci || npm install --legacy-peer-deps

# Copiar el resto del código (tsconfig.json, nest-cli.json, src, etc.)
COPY . .

# Build (NestJS)
RUN node --version && npm --version
RUN npm run build

# Stage 2: Runtime (Debian)
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev || npm install --only=production --legacy-peer-deps

# Copiar la app compilada
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
