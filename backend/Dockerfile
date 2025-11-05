FROM node:20-alpine

WORKDIR /app

# Install build dependencies (needed for some native modules)
RUN apk update && apk add --no-cache python3 build-base

# Verify node and npm are available
RUN node --version && npm --version

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
RUN npm install --legacy-peer-deps

# Verify nest CLI is installed and available
RUN ls -la node_modules/.bin/ | grep nest || echo "nest CLI not found in node_modules/.bin"
RUN test -f node_modules/.bin/nest || (echo "ERROR: nest CLI not found" && exit 1)

# Copy source code
COPY . .

# Build the application - try multiple methods for compatibility
RUN npm run build || \
    ./node_modules/.bin/nest build || \
    npx nest build || \
    (echo "ERROR: All build methods failed" && exit 1)

# Verify build output exists
RUN test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && exit 1)

# Remove devDependencies to reduce image size
RUN npm prune --production && npm cache clean --force

# Remove build dependencies
RUN apk del python3 build-base

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
