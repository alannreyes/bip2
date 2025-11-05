# Stage 1: Builder (con toolchain suficiente, sin apt/apk)
FROM node:20 AS builder

WORKDIR /app

# Instala TODAS las dependencias (incluye dev para compilar Nest y nativos)
COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

# Copia el resto del código (tsconfig.json, nest-cli.json, src/, etc.)
COPY . .

# Build de la app NestJS
RUN node --version && npm --version
RUN npm run build

# Deja SOLO dependencias de producción (evita compilar en runtime)
RUN npm prune --omit=dev

# Stage 2: Runtime (ligero, sin toolchain)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiamos node_modules ya “podados” desde el builder (sin dev)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
