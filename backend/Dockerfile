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
RUN npm install --legacy-peer-deps

# Copy source code
COPY src ./src

# Build application - capture full error output
RUN set -e; \
    echo "=== Starting build process ==="; \
    echo "=== Node version ==="; \
    node --version; \
    echo "=== NPM version ==="; \
    npm --version; \
    echo "=== Checking nest CLI ==="; \
    (npx nest --version || node_modules/.bin/nest --version || echo "nest CLI not in PATH") || true; \
    echo "=== Attempting npm run build ==="; \
    npm run build 2>&1 | tee /tmp/build.log || BUILD_EXIT=$?; \
    if [ -n "$BUILD_EXIT" ]; then \
      echo "=== BUILD FAILED WITH EXIT CODE: $BUILD_EXIT ==="; \
      echo "=== Full build log ==="; \
      cat /tmp/build.log; \
      echo "=== Checking for TypeScript errors ==="; \
      npx tsc --noEmit 2>&1 | head -100 || true; \
      echo "=== Listing src directory ==="; \
      ls -la src/ || true; \
      echo "=== Checking if main.ts exists ==="; \
      test -f src/main.ts && echo "main.ts exists" || echo "main.ts NOT FOUND"; \
      exit $BUILD_EXIT; \
    fi

# Verify build output exists
RUN test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && ls -la dist/ 2>/dev/null || echo "dist directory does not exist" && exit 1)

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install only production dependencies
RUN npm install --only=production --legacy-peer-deps

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/main.js"]
