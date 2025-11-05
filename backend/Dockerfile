FROM node:20-alpine

WORKDIR /app

# Install build dependencies (some npm packages need these)
# Update package index first, then install
RUN apk update && apk add --no-cache python3 make g++

# Copy package files first (for better layer caching)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install ALL dependencies (devDependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/main.js"]
