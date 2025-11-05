FROM node:20-alpine

WORKDIR /app

# Verify node and npm are available
RUN node --version && npm --version

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
RUN npm install --legacy-peer-deps

# Ensure @nestjs/cli is available (install if missing)
RUN npm list @nestjs/cli || npm install --save-dev @nestjs/cli@latest || echo "Continuing without explicit CLI install"

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

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
