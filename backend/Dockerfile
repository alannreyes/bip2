# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Herramientas para compilar posibles dependencias nativas (mysql2/pg/etc.)
RUN apk add --no-cache python3 make g++

# Instalar dependencias de desarrollo para compilar
ENV NODE_ENV=development

# Copiar package files primero para aprovechar cache
COPY package*.json ./

# Instalar dependencias (usa ci si hay lock; fallback a install con legacy peer deps)
RUN npm ci || npm install --legacy-peer-deps

# Copiar el resto del código (tsconfig.json, nest-cli.json, src, etc.)
COPY . .

# Verificación y build (NestJS)
RUN node --version && npm --version
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev || npm install --only=production --legacy-peer-deps

# Copiar la app compilada
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]
