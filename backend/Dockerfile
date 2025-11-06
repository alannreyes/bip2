# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for some native modules)
RUN apk add --no-cache python3 make g++

# Ensure NODE_ENV is not production to install devDependencies
ENV NODE_ENV=development

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

# Verify npm and node are available
RUN node --version && npm --version

# Verify nest CLI is installed
RUN test -f node_modules/.bin/nest || (echo "ERROR: nest CLI not found after npm install" && npm list @nestjs/cli && exit 1)

# Copy source code
COPY src ./src

# Build application - use explicit path to nest CLI
RUN node_modules/.bin/nest build || npm run build || (echo "Build failed" && exit 1)

# Verify build output exists
RUN test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && exit 1)

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install only production dependencies
RUN npm ci --only-production || npm install --only=production --legacy-peer-deps

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/main.js"]
