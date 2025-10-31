# BIP2 - Guía Rápida de Despliegue

## 🚀 Despliegue en 5 Minutos

### 1. Preparar Servidor

```bash
# Instalar Docker y Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clonar y Configurar

```bash
# Clonar repositorio
git clone https://github.com/alannreyes/bip2.git
cd bip2

# Configurar variables de entorno
cp .env.production.example .env.production
nano .env.production  # Editar con tus valores
```

**Valores críticos a cambiar en `.env.production`:**
- `POSTGRES_PASSWORD` - Password seguro para PostgreSQL
- `REDIS_PASSWORD` - Password seguro para Redis
- `GEMINI_API_KEY` - Tu API key de Google Gemini
- `JWT_SECRET` - Token aleatorio (min 32 caracteres)
- `FRONTEND_DOMAIN` - Tu dominio frontend (ej: bip.empresa.com)
- `BACKEND_DOMAIN` - Tu dominio backend (ej: api.bip.empresa.com)
- `NEXT_PUBLIC_API_URL` - URL de tu API (https://api.bip.empresa.com/api)

### 3. Desplegar

```bash
# Hacer ejecutable el script
chmod +x deploy.sh

# Despliegue inicial (Traefik + App)
./deploy.sh init

# O manualmente:
docker network create traefik-public
docker compose -f traefik-compose.yml up -d
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Verificar

```bash
# Ver estado
./deploy.sh status

# Ver logs
./deploy.sh logs
```

### 5. Acceder

- Frontend: `https://TU_DOMINIO`
- Backend API: `https://api.TU_DOMINIO/api`
- Traefik Dashboard: `https://traefik.TU_DOMINIO` (requiere auth)

## 📋 Comandos Útiles

```bash
# Deployment
./deploy.sh init       # Despliegue inicial completo
./deploy.sh deploy     # Desplegar solo la aplicación
./deploy.sh update     # Actualizar desde Git

# Mantenimiento
./deploy.sh status     # Ver estado de contenedores
./deploy.sh logs       # Ver logs en tiempo real
./deploy.sh restart    # Reiniciar aplicación
./deploy.sh stop       # Detener aplicación
./deploy.sh backup     # Backup de base de datos
```

## 🔧 Configuración Post-Despliegue

### Agregar Primer Data Source

```bash
curl -X POST https://api.TU_DOMINIO/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "EFC Catalog",
    "type": "mssql",
    "config": {
      "host": "SQL_SERVER_HOST",
      "port": 1433,
      "username": "USER",
      "password": "PASS",
      "database": "DB_NAME"
    },
    "query": "SELECT TOP 10 * FROM tabla",
    "embeddingFields": ["campo1", "campo2"],
    "collectionName": "catalogo_efc_200k"
  }'
```

## 📊 Estructura de Servicios

```
┌─────────────────────────────────────────┐
│          Traefik (Reverse Proxy)        │
│         SSL/TLS con Let's Encrypt       │
└────────┬────────────────────┬───────────┘
         │                    │
    ┌────▼──────┐      ┌─────▼──────┐
    │ Frontend  │      │  Backend   │
    │ (Next.js) │      │  (NestJS)  │
    └───────────┘      └─────┬──────┘
                             │
         ┌───────────────────┼────────────────┐
         │                   │                │
    ┌────▼─────┐      ┌─────▼─────┐   ┌─────▼────┐
    │PostgreSQL│      │   Redis   │   │  Qdrant  │
    └──────────┘      └───────────┘   └──────────┘
```

## 🔒 Checklist de Seguridad

- [ ] Cambiar TODAS las contraseñas en `.env.production`
- [ ] Configurar firewall (UFW)
- [ ] Verificar que SSL está funcionando
- [ ] Revisar logs por errores
- [ ] Configurar backups automáticos
- [ ] Restringir acceso SSH

## 🐛 Troubleshooting Rápido

**Contenedor no inicia:**
```bash
docker logs NOMBRE_CONTENEDOR
```

**SSL no funciona:**
```bash
docker logs traefik | grep acme
nslookup TU_DOMINIO
```

**Backend no conecta a DB:**
```bash
docker exec -it bip-backend ping postgres
docker logs bip-postgres
```

## 📚 Documentación Completa

Ver `DEPLOYMENT.md` para la guía completa de despliegue con todos los detalles.

## 🆘 Comandos de Emergencia

```bash
# Parar todo
docker compose -f docker-compose.prod.yml down

# Ver uso de recursos
docker stats

# Limpiar espacio
docker system prune -a

# Backup de emergencia
docker exec bip-postgres pg_dump -U postgres qdrant_catalog_sync > emergency_backup.sql
```

---

**¿Problemas?** Revisa logs con `./deploy.sh logs` o consulta `DEPLOYMENT.md`
