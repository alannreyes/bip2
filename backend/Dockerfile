FROM node:20-alpine

WORKDIR /app

# Verify node and npm are available
RUN node --version && npm --version

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
# Ensure NODE_ENV is not production to install devDependencies
ENV NODE_ENV=development
RUN npm install --legacy-peer-deps
ENV NODE_ENV=production

# Verify @nestjs/cli is installed
RUN echo "Checking for @nestjs/cli..." && \
    (npm list @nestjs/cli || npm install --save-dev @nestjs/cli@latest) && \
    echo "Nest CLI check completed"

# List installed packages for debugging
RUN echo "Installed packages:" && npm list --depth=0 2>/dev/null || true

# Copy source code
COPY . .

# Build the application with verbose output
RUN echo "Starting build process..." && \
    (npm run build 2>&1 || \
     (echo "npm run build failed, trying direct nest..." && \
      ./node_modules/.bin/nest build 2>&1) || \
     (echo "Direct nest failed, trying npx..." && \
      npx nest build 2>&1) || \
     (echo "ERROR: All build methods failed. Showing last error:" && \
      npm run build 2>&1 | tail -50 && \
      exit 1))

# Verify build output exists
RUN test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && exit 1)

# Remove devDependencies to reduce image size
RUN npm prune --production && npm cache clean --force

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
