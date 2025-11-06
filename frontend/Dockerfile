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

# Build application - ejecutar build directamente para ver el error real
RUN NODE_OPTIONS='--max-old-space-size=4096' npm run build

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
