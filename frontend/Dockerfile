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

# Build application - show full error output
RUN echo "Building Next.js application..." && \
    (NODE_OPTIONS='--max-old-space-size=6144' npm run build 2>&1) || \
    (echo "=== BUILD FAILED ===" && \
     echo "=== Running build again to show full error ===" && \
     NODE_OPTIONS='--max-old-space-size=6144' npm run build && \
     exit 1)

# Stage 2: Runtime (modo completo - más simple y confiable)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copiar todo lo necesario para modo completo
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

# Usar next start (modo completo - más simple)
CMD ["npx", "next", "start", "-p", "3000"]
