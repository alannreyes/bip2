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

# Build application - capture all output including errors
RUN echo "=== Starting build process ===" && \
    node --version && \
    npm --version && \
    echo "=== Checking TypeScript ===" && \
    npx tsc --version && \
    echo "=== Checking Next.js ===" && \
    npx next --version && \
    echo "=== Checking config files ===" && \
    ls -la *.config.* *.json 2>/dev/null || echo "Some config files may be missing" && \
    echo "=== Running TypeScript check first ===" && \
    (npx tsc --noEmit 2>&1 | head -50 || echo "TypeScript check completed") && \
    echo "=== Running npm build (capturing all output) ===" && \
    NODE_OPTIONS='--max-old-space-size=6144' npm run build 2>&1 | tee /tmp/build.log || \
    (BUILD_EXIT=$? && \
     echo "=== BUILD FAILED with exit code: $BUILD_EXIT ===" && \
     echo "=== Full build output ===" && \
     cat /tmp/build.log 2>/dev/null || echo "No build log available" && \
     echo "=== TypeScript errors ===" && \
     npx tsc --noEmit 2>&1 | head -100 || echo "No TypeScript errors" && \
     echo "=== Next.js info ===" && \
     npx next info 2>&1 || echo "Next.js info failed" && \
     exit 1) && \
    echo "=== Build completed successfully ===" && \
    echo "=== Verifying build output ===" && \
    ls -la .next/ 2>/dev/null || echo "WARNING: .next directory not found" && \
    test -f .next/BUILD_ID && echo "BUILD_ID verified: $(cat .next/BUILD_ID)" || (echo "ERROR: BUILD_ID not found after build" && echo "=== Contents of .next ===" && ls -la .next/ 2>/dev/null || echo ".next directory does not exist" && exit 1)

# Stage 2: Runtime (usando standalone si está disponible)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiar desde standalone si existe (más eficiente para producción)
# Con standalone, Next.js genera .next/standalone/ con server.js y dependencias mínimas
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Fallback: si standalone no existe, copiar todo (modo completo)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next

# Verificar que BUILD_ID existe (puede estar en .next o en la raíz con standalone)
RUN (test -f .next/BUILD_ID || test -f BUILD_ID) && echo "BUILD_ID verified in runtime stage" || (echo "WARNING: BUILD_ID not found, but continuing..." && ls -la .next/ 2>/dev/null || echo ".next directory check")

# Permisos para el usuario 'node'
RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usar server.js si standalone existe (está en la raíz después de copiar .next/standalone)
# Sino usar next start (modo completo)
CMD ["sh", "-c", "if [ -f server.js ]; then echo 'Starting with standalone mode' && node server.js; else echo 'Starting with full mode' && npx next start -p 3000; fi"]
