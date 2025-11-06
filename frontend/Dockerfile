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

# Build application - capture full error output (compatible con /bin/sh)
RUN echo "=== Starting build process ===" && \
    echo "=== Node version ===" && \
    node --version && \
    echo "=== NPM version ===" && \
    npm --version && \
    echo "=== Checking Next.js ===" && \
    (npm list next || echo "Next.js not found in package.json") || true && \
    echo "=== Attempting npm run build ===" && \
    (NODE_OPTIONS='--max-old-space-size=4096' npm run build 2>&1 | tee /tmp/build.log) || ( \
      BUILD_EXIT=$?; \
      echo "=== BUILD FAILED WITH EXIT CODE: $BUILD_EXIT ==="; \
      echo "=== Full build log ==="; \
      cat /tmp/build.log 2>/dev/null || echo "No build log available"; \
      echo "=== Checking for TypeScript errors ==="; \
      npx tsc --noEmit 2>&1 | head -100 || true; \
      echo "=== Listing app directory ==="; \
      ls -la app/ 2>/dev/null || echo "app directory does not exist"; \
      echo "=== Checking if .next directory exists ==="; \
      ls -la .next/ 2>/dev/null || echo ".next directory does not exist"; \
      exit $BUILD_EXIT \
    )

# Verify build output exists
RUN if [ -d .next ]; then \
      echo "=== Build output verified ==="; \
      ls -la .next/ | head -10; \
    else \
      echo "=== ERROR: .next directory not found after build ==="; \
      echo "=== Listing current directory ==="; \
      ls -la; \
      echo "=== Checking if build actually ran ==="; \
      if [ -f /tmp/build.log ]; then \
        echo "Build log exists, showing last 50 lines:"; \
        tail -50 /tmp/build.log; \
      else \
        echo "No build log found"; \
      fi; \
      exit 1; \
    fi

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
