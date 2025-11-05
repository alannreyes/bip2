# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Update package index and install build tools
RUN apk --no-cache update && \
    apk --no-cache add python3 make g++ curl

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Clean npm cache and install dependencies
RUN npm cache clean --force && npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Update package index and install curl for healthchecks
RUN apk --no-cache update && \
    apk --no-cache add curl

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only-production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "dist/main.js"]
