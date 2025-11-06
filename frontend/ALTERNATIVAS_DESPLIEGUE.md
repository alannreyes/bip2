# Alternativas de Despliegue para el Frontend

## Problema Actual
El build de Docker está fallando sin mostrar el error real. Aquí hay alternativas:

## Opción 1: Despliegue sin Docker (Recomendado para resolver rápido)

### En el servidor directamente:

```bash
# 1. Clonar el repositorio
git clone https://github.com/alannreyes/bip2.git
cd bip2/frontend

# 2. Instalar dependencias
npm install --legacy-peer-deps

# 3. Configurar variables de entorno
export NEXT_PUBLIC_API_URL=http://192.168.40.197:3001/api

# 4. Build
npm run build

# 5. Iniciar en producción
npm run start
```

### Con PM2 (para mantenerlo corriendo):

```bash
# Instalar PM2
npm install -g pm2

# Iniciar la aplicación
cd frontend
pm2 start npm --name "frontend" -- start

# Guardar configuración
pm2 save
pm2 startup
```

## Opción 2: Dockerfile Ultra Simplificado (Single Stage)

Crea un Dockerfile completamente diferente:

```dockerfile
FROM node:20

WORKDIR /app

# Copiar todo
COPY . .

# Instalar y build
RUN npm install --legacy-peer-deps && \
    npm run build

# Exponer puerto
EXPOSE 3000

# Iniciar
CMD ["npm", "start"]
```

## Opción 3: Usar Next.js 14 (Más Estable)

Cambiar en `package.json`:

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

## Opción 4: Build Local y Copiar Resultado

1. Build localmente en tu máquina:
```bash
cd frontend
npm install
npm run build
```

2. Crear Dockerfile que solo sirva los archivos ya construidos:

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copiar solo los archivos construidos
COPY .next ./.next
COPY public ./public
COPY package.json ./
COPY node_modules ./node_modules

EXPOSE 3000

CMD ["npx", "next", "start"]
```

## Opción 5: Usar Vercel o Netlify

Despliega directamente desde GitHub:
- Vercel: https://vercel.com
- Netlify: https://netlify.com

Ambos detectan Next.js automáticamente.

## Recomendación Inmediata

**Usa la Opción 1 (Despliegue sin Docker)** para resolver rápido y tener la app funcionando mientras resolvemos el problema de Docker.

