FROM node:20-alpine

WORKDIR /app

# Verify node and npm are available
RUN node --version && npm --version

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
RUN npm ci --verbose

# Copy source code
COPY . .

# Build the application - try multiple approaches
RUN npx nest build || npm run build || node_modules/.bin/nest build

# Remove devDependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
