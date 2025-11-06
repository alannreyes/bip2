# Stage 1: Builder (Next.js)
FROM node:20 AS builder

WORKDIR /app

# Build argument para API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Instalar sharp para optimización de imágenes (requerido por Next.js)
RUN npm install -g sharp

# Dependencias para build (dev incluidas)
COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

# Instalar sharp localmente también
RUN npm install sharp || echo "sharp installation optional"

# Código fuente
COPY . .

# Build con captura de errores y validación
RUN set -e; \
    echo "=== Starting Next.js build ==="; \
    echo "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"; \
    echo "=== Next.js version ==="; \
    npx next --version || npm list next; \
    echo "=== Running build ==="; \
    npm run build 2>&1 | tee /tmp/build.log; \
    BUILD_EXIT=${PIPESTATUS[0]}; \
    if [ "$BUILD_EXIT" -ne 0 ]; then \
      echo "=== BUILD FAILED WITH EXIT CODE: $BUILD_EXIT ==="; \
      echo "=== Full build log ==="; \
      cat /tmp/build.log; \
      exit $BUILD_EXIT; \
    fi; \
    echo "=== Build completed successfully ==="; \
    echo "=== Verifying build output ==="; \
    echo "=== Contents of .next directory ==="; \
    ls -la .next/ 2>/dev/null || echo ".next directory does not exist"; \
    if [ -d ".next/standalone" ]; then \
      echo "=== Standalone directory found (using standalone mode) ==="; \
      ls -la .next/standalone | head -10; \
    else \
      echo "=== Standalone not found (using full copy mode) ==="; \
      echo "=== Checking .next structure ==="; \
      ls -la .next/ | head -20; \
    fi

# Stage 2: Runtime (modo completo - más robusto)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Instalar dependencias del sistema para sharp
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

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
