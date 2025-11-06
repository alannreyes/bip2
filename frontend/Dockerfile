# Stage 1: Builder (Next.js)
FROM node:20 AS builder

WORKDIR /app

# Build argument para API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Ensure NODE_ENV is not production to install devDependencies (igual que backend)
ENV NODE_ENV=development

# Copy package files first (igual que backend)
COPY package.json ./
COPY package-lock.json* ./

# Install all dependencies (igual que backend)
RUN npm install --legacy-peer-deps

# Instalar sharp localmente (opcional, para optimización de imágenes)
RUN npm install sharp --save-optional || echo "Warning: sharp installation failed, continuing without it"

# Copy source code and config files
COPY . .

# Build application - capture full error output (mismo patrón que backend)
RUN set -e; \
    echo "=== Starting build process ==="; \
    echo "=== Node version ==="; \
    node --version; \
    echo "=== NPM version ==="; \
    npm --version; \
    echo "=== Checking Next.js ==="; \
    (npm list next || echo "Next.js not found in package.json") || true; \
    echo "=== Attempting npm run build ==="; \
    NODE_OPTIONS='--max-old-space-size=4096' npm run build 2>&1 | tee /tmp/build.log || BUILD_EXIT=$?; \
    if [ -n "$BUILD_EXIT" ]; then \
      echo "=== BUILD FAILED WITH EXIT CODE: $BUILD_EXIT ==="; \
      echo "=== Full build log ==="; \
      cat /tmp/build.log; \
      echo "=== Checking for TypeScript errors ==="; \
      npx tsc --noEmit 2>&1 | head -100 || true; \
      echo "=== Listing app directory ==="; \
      ls -la app/ 2>/dev/null || echo "app directory does not exist"; \
      echo "=== Checking if .next directory exists ==="; \
      ls -la .next/ 2>/dev/null || echo ".next directory does not exist"; \
      exit $BUILD_EXIT; \
    fi

# Verify build output exists (igual que backend)
RUN test -d .next && echo "Build output verified" || (echo "ERROR: .next directory not found after build" && ls -la .next/ 2>/dev/null || echo ".next directory does not exist" && exit 1)

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
