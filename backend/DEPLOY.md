# Guía de Despliegue - Backend

## Despliegue en Producción

### 1. Variables de Entorno

Asegúrate de configurar todas las variables en `.env`:

```env
# Database
DATABASE_HOST=tu-postgres-host
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=tu-password-seguro
DATABASE_NAME=qdrant_sync

# Redis
REDIS_HOST=tu-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=tu-redis-password

# Qdrant
QDRANT_HOST=192.168.2.6
QDRANT_PORT=6333

# Gemini
GEMINI_API_KEY=tu_api_key_real

# App
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://tudominio.com

# JWT (opcional para autenticación futura)
JWT_SECRET=tu-jwt-secret-muy-seguro
```

### 2. Migraciones de Base de Datos

```bash
# Ejecutar migraciones
npm run typeorm:migration:run

# Si necesitas revertir
npm run typeorm:migration:revert
```

### 3. Build para Producción

```bash
npm run build
npm run start:prod
```

### 4. Despliegue con Docker

```bash
# Build
docker build -t qdrant-sync-backend .

# Run
docker run -p 3001:3001 \
  --env-file .env \
  qdrant-sync-backend
```

### 5. Despliegue con Docker Compose

```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3001:3001"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: qdrant_sync
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### 6. Despliegue en Easypanel

1. Crea nueva aplicación
2. Conecta repositorio
3. Configura Dockerfile
4. Añade servicios (PostgreSQL, Redis)
5. Configura variables de entorno
6. Deploy

### 7. Monitoreo

**Health Checks:**
```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/health/database
curl http://localhost:3001/api/health/qdrant
curl http://localhost:3001/api/health/redis
```

**Logs de Bull Queues:**
- Los jobs en proceso se pueden monitorear en Redis
- Considerar instalar Bull Board para UI

### 8. Optimizaciones de Producción

**PM2 (Process Manager):**
```bash
npm install -g pm2
pm2 start dist/main.js --name qdrant-sync -i max
pm2 save
pm2 startup
```

**Configuración PM2 (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'qdrant-sync',
    script: './dist/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

### 9. Backup de Base de Datos

```bash
# Backup
pg_dump -h localhost -U postgres qdrant_sync > backup.sql

# Restore
psql -h localhost -U postgres qdrant_sync < backup.sql
```

### 10. Seguridad

- [ ] Cambiar todos los passwords por defecto
- [ ] Configurar firewall (solo puertos necesarios)
- [ ] Activar SSL/TLS para PostgreSQL
- [ ] Activar SSL/TLS para Redis
- [ ] Rate limiting en endpoints públicos
- [ ] Configurar CORS correctamente
- [ ] Monitoreo de logs de seguridad

## Troubleshooting

**Error de conexión a PostgreSQL:**
- Verifica credenciales
- Verifica que PostgreSQL esté corriendo
- Verifica firewall/networking

**Jobs de Bull no procesan:**
- Verifica conexión a Redis
- Revisa logs de workers
- Verifica memoria disponible

**Error de Gemini API:**
- Verifica API key
- Revisa quotas/límites
- Verifica conectividad a internet

**Qdrant no responde:**
- Verifica host:port
- Verifica que Qdrant esté corriendo
- Verifica networking entre servicios
