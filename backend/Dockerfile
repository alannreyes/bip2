# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm install

# Copiar todo el contenido del proyecto
COPY . .

# Intentar la construcción sin instalación global
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=prod

# Copiar la aplicación compilada
COPY --from=builder /app/dist ./dist

# Exponer el puerto
EXPOSE 3001

# Comando de inicio
CMD ["node", "dist/main.js"]
