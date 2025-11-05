FROM node:20-alpine

WORKDIR /app

# Verify node and npm are available
RUN node --version && npm --version

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
# Using npm install instead of npm ci for better compatibility
RUN npm install

# Verify nest CLI is installed
RUN ls -la node_modules/.bin/ | grep nest || echo "nest CLI not found in node_modules/.bin"

# Copy source code
COPY . .

# Build the application - use direct path to nest CLI
RUN ./node_modules/.bin/nest build

# Remove devDependencies to reduce image size
RUN npm prune --production && npm cache clean --force

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
