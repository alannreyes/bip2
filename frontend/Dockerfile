# Stage 1: Builder (Next.js)
FROM node:20 AS builder

WORKDIR /app

# Build argument para API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Dependencias para build (dev incluidas)
COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

# Código fuente
COPY . .

# Build con captura de errores y validación
RUN set -e; \
    echo "=== Starting Next.js build ==="; \
    echo "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"; \
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
    if [ ! -d ".next/standalone" ]; then \
      echo "ERROR: .next/standalone directory not found!"; \
      echo "=== Contents of .next directory ==="; \
      ls -la .next/ 2>/dev/null || echo ".next directory does not exist"; \
      echo "=== Full build log ==="; \
      cat /tmp/build.log; \
      exit 1; \
    fi; \
    echo "=== Standalone directory found ==="; \
    ls -la .next/standalone | head -10

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
