# Dockerfile Ultra Simplificado - Una sola etapa
FROM node:20

WORKDIR /app

# Variables de entorno
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=production

# Copiar e instalar
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar código
COPY . .

# Build
RUN npm run build

# Exponer puerto
EXPOSE 3000
ENV PORT=3000

# Iniciar
CMD ["npm", "start"]
