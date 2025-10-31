# Guía de Despliegue - Frontend

## Despliegue en Producción

### 1. Variables de Entorno

Crea `.env.production`:
```env
NEXT_PUBLIC_API_URL=https://api.tudominio.com/api
```

### 2. Build para Producción

```bash
npm run build
npm run start
```

### 3. Despliegue con Docker

```bash
# Build
docker build -t qdrant-sync-frontend .

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://api.tudominio.com/api \
  qdrant-sync-frontend
```

### 4. Despliegue en Easypanel

1. Crea nueva aplicación en Easypanel
2. Conecta el repositorio
3. Configura variables de entorno
4. Build command: `npm run build`
5. Start command: `npm run start`
6. Puerto: 3000

### 5. Optimizaciones

- Activar compresión gzip
- Configurar CDN para assets estáticos
- Cache de API responses
- Image optimization automático (Next.js)

## Troubleshooting

**Error de conexión API:**
- Verifica NEXT_PUBLIC_API_URL
- Verifica CORS en backend

**Build lento:**
- Incrementa memoria disponible: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`

**Imágenes no cargan:**
- Verifica configuración de dominios permitidos en next.config.js
