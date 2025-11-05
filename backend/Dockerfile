# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Asegura dependencias de desarrollo para compilar
ENV NODE_ENV=development

# Copiar package files primero para cache
COPY package*.json ./

# Instalar dependencias (usa ci si hay lockfile; fallback a install con legacy peer deps)
RUN npm ci || npm install --legacy-peer-deps

# Copiar el resto del código
COPY . .

# Verificaciones mínimas y build
RUN node --version && npm --version
RUN npm run build || (echo "Build failed" && exit 1)

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
