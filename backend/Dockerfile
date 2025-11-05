# Stage 1: Builder
FROM node:20 AS builder

WORKDIR /app

# Copiar solo los archivos necesarios para instalar dependencias
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm install

# Copiar el resto del código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar solo las dependencias de producción
RUN npm ci --omit=dev

# Copiar la aplicación construida desde el stage anterior
COPY --from=builder /app/dist ./dist

# Exponer el puerto
EXPOSE 3001

# Iniciar la aplicación
CMD ["node", "dist/main.js"]
