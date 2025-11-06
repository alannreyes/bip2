# Stage 1: Builder (Next.js)
FROM node:20 AS builder

WORKDIR /app

# Build argument para API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Dependencias para build (dev incluidas)
COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

# Instalar sharp localmente (opcional, para optimización de imágenes)
RUN npm install sharp --save-optional || echo "Warning: sharp installation failed, continuing without it"

# Código fuente
COPY . .

# Build con verificación y captura de errores
RUN set -e; \
    echo "=== Starting Next.js build ==="; \
    echo "=== Node version ==="; \
    node --version; \
    echo "=== NPM version ==="; \
    npm --version || echo "NPM not found"; \
    echo "=== Next.js version ==="; \
    npm list next || echo "Next.js not in package.json"; \
    echo "=== Running build ==="; \
    echo "=== Checking if next is available ==="; \
    npx next --version || echo "next not found in PATH"; \
    echo "=== Executing build ==="; \
    npx next build 2>&1 || BUILD_EXIT=$?; \
    if [ -n "$BUILD_EXIT" ]; then \
      echo "=== BUILD FAILED WITH EXIT CODE: $BUILD_EXIT ==="; \
      echo "=== Checking if .next directory exists ==="; \
      ls -la .next/ 2>/dev/null || echo ".next directory does not exist"; \
      exit $BUILD_EXIT; \
    fi; \
    echo "=== Build completed successfully ==="; \
    echo "=== Verifying build output ==="; \
    ls -la .next/ 2>/dev/null || (echo "ERROR: .next directory not found after build" && exit 1)

# Stage 2: Runtime (modo completo - más robusto)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiar todo lo necesario (modo completo es más confiable)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Permisos para el usuario 'node'
RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usar next start (funciona siempre, independientemente de standalone)
CMD ["npx", "next", "start", "-p", "3000"]
