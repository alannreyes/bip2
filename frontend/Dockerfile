FROM node:20

WORKDIR /app

# Variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# NO establecer NODE_ENV aquí - npm instalará devDependencies automáticamente

# Instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar código
COPY . .

# Build - Next.js manejará NODE_ENV internamente
RUN npm run build 2>&1

# Runtime
ENV NODE_ENV=production
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
