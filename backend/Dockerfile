# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

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

# Build application
RUN npm run build

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
