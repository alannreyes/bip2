FROM node:20-alpine

# Verify image base is correct
RUN which node && which npm && node --version && npm --version

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Install dependencies using full path to npm
RUN /usr/local/bin/npm ci || /usr/local/bin/npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build using full path
RUN /usr/local/bin/npm run build

# Verify build output
RUN ls -la dist/ && test -f dist/main.js

# Remove dev dependencies
RUN /usr/local/bin/npm prune --production

EXPOSE 3001

CMD ["node", "dist/main.js"]
