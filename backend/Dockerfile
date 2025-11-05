# Stage 1: Builder
<<<<<<< HEAD
FROM node:20-alpine AS builder

WORKDIR /app

# Ensure NODE_ENV is not production to install devDependencies
ENV NODE_ENV=development

# Copy package files from backend directory (context is repo root)
COPY backend/package*.json ./
COPY backend/nest-cli.json ./
COPY backend/tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

# Verify npm and node are available
RUN node --version && npm --version

# Verify nest CLI is installed
RUN ls -la node_modules/.bin/ | head -20 || echo "node_modules/.bin not found"
RUN test -f node_modules/.bin/nest || (echo "ERROR: nest CLI not found after npm install" && npm list @nestjs/cli && exit 1)

# Copy source code from backend directory (overwrite config files, keep node_modules)
COPY backend/src ./src

# Build application - use explicit path to nest CLI
RUN node_modules/.bin/nest build || npm run build || (echo "Build failed" && exit 1)

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files from backend directory (context is repo root)
COPY backend/package*.json ./

# Install only production dependencies
RUN npm ci --only-production || npm install --only=production --legacy-peer-deps

# Copy built application from builder (dist is in /app from builder stage)
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start application
=======
FROM node:20 AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm install

# Copiar todo el contenido del proyecto
COPY . .

# Intentar la construcción sin instalación global
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=prod

# Copiar la aplicación compilada
COPY --from=builder /app/dist ./dist

# Exponer el puerto
EXPOSE 3001

# Comando de inicio
>>>>>>> 5ab1795d5f4b15f9f402e368f9a0cd4968b507d0
CMD ["node", "dist/main.js"]
