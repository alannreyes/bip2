# Stage 1: Builder
# Use node:20 (Debian-based) instead of alpine for better compatibility with native modules
FROM node:20 AS builder

WORKDIR /app

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

# Verify @nestjs/cli is installed (optional check, but don't fail if path is different)
RUN npm list @nestjs/cli || echo "Warning: @nestjs/cli not found in list, but continuing..."

# Copy source code
COPY src ./src

# Build application - use npm run build which is configured in package.json
# This is more reliable than trying to find nest CLI directly
RUN npm run build || (echo "Build failed" && exit 1)

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
