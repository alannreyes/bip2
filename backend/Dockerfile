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

# Verify critical packages are installed
RUN npm list typescript @nestjs/cli || echo "Warning: Some packages may not be listed"

# List installed packages for debugging
RUN echo "Node modules:" && ls -la node_modules/.bin/ | head -20 || true

# Copy source code
COPY src ./src

# Add node_modules/.bin to PATH for easier access to CLI tools
ENV PATH="/app/node_modules/.bin:${PATH}"

# Verify structure before build
RUN echo "=== Pre-build verification ===" && \
    echo "Current directory: $(pwd)" && \
    echo "Source files:" && ls -la src/ | head -10 && \
    echo "Node modules bin:" && ls -la node_modules/.bin/ | grep -E "(nest|tsc)" || echo "No build tools found" && \
    echo "Package.json scripts:" && cat package.json | grep -A 2 '"build"'

# Build application - try multiple methods
RUN echo "=== Starting build ===" && \
    npm run build 2>&1

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
