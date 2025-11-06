# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Install build tools for native modules (mssql, pg, mysql2)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Ensure NODE_ENV is not production to install devDependencies
ENV NODE_ENV=development

# Copy package files
COPY package.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm install --legacy-peer-deps || npm install

# Verify nest CLI is available
RUN npx nest --version || node_modules/.bin/nest --version || echo "Warning: nest CLI check"

# Copy source code
COPY src ./src

# Build application - try nest build first, fallback to tsc
RUN (npm run build || npx tsc || (echo "=== BUILD FAILED ===" && exit 1)) && \
    test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && exit 1)

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install only production dependencies
RUN npm install --only=production --legacy-peer-deps || npm install --production --legacy-peer-deps

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/main.js"]
