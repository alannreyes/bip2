# Dockerfile Ultra Simplificado - Una sola etapa
FROM node:20

WORKDIR /app

# Variables de entorno
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# IMPORTANTE: NODE_ENV=development durante build para instalar devDependencies
ENV NODE_ENV=development

# Copiar e instalar
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar código
COPY . .

# Build (con NODE_ENV=development para tener todas las herramientas)
RUN npm run build

# Cambiar a production solo para runtime
ENV NODE_ENV=production

# Exponer puerto
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Iniciar
CMD ["npx", "next", "start", "-p", "3000"]
