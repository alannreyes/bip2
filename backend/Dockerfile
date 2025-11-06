# Stage 1: Builder (sin apt/apk; usa toolchain de node:20)
FROM node:20 AS builder

WORKDIR /app

# Asegura que los binarios de node_modules/.bin estén en PATH
ENV PATH=/app/node_modules/.bin:$PATH
ENV NODE_ENV=development

# Instala dependencias (dev incluidas para compilar)
COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

# Copia el resto del código (tsconfig.json, nest-cli.json, src/, etc.)
COPY . .

# Diagnóstico y build de NestJS
# 1) Ver versiones
RUN node --version && npm --version
# 2) Confirma que 'nest' esté disponible o usa fallback explícito
RUN (nest --version || node node_modules/.bin/nest --version)
# 3) Build (primero por PATH; si falla, usa la ruta explícita)
RUN (nest build || node node_modules/.bin/nest build)

# Deja sólo dependencias de producción para runtime
RUN npm prune --omit=dev

# Stage 2: Runtime (ligero, sin toolchain)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copia node_modules ya “podados”, package.json y la app compilada
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
