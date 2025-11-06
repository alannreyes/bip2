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

# Build application
RUN echo "=== Starting build process ===" && \
    node --version && \
    npm --version && \
    echo "=== Running npm build ===" && \
    NODE_OPTIONS='--max-old-space-size=4096' npm run build

# Verify BUILD_ID exists
RUN test -f .next/BUILD_ID && echo "BUILD_ID verified: $(cat .next/BUILD_ID)" || (echo "ERROR: BUILD_ID not found" && ls -la .next/ 2>/dev/null && exit 1)

# Stage 2: Runtime (modo completo - más robusto)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiar todo lo necesario (modo completo es más confiable)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Verificar que BUILD_ID existe después de copiar
RUN test -f .next/BUILD_ID && echo "BUILD_ID verified in runtime stage" || (echo "ERROR: BUILD_ID not found after copy" && ls -la .next/ 2>/dev/null || echo ".next directory does not exist" && exit 1)

# Permisos para el usuario 'node'
RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usar next start (funciona siempre, independientemente de standalone)
CMD ["npx", "next", "start", "-p", "3000"]
