# 🔧 Troubleshooting - BIP2 Portainer Deployment

Guía de solución de problemas comunes durante el despliegue de BIP2 en Portainer/Ubuntu.

---

## 📋 Diagnóstico Rápido

### Script de Validación Automática

Ejecuta el script de validación para identificar problemas comunes:

```bash
./validate-deployment.sh
```

Este script verifica:
- ✅ Instalación de Docker y Docker Compose
- ✅ Sintaxis de archivos docker-compose
- ✅ Presencia de archivos necesarios
- ✅ Disponibilidad de puertos
- ✅ Secrets hardcodeadas
- ✅ Espacio en disco

---

## 🚨 Problemas Comunes

### 1. Backend no inicia / se reinicia constantemente

#### Síntomas
- Contenedor `bip2-backend` en estado "Restarting"
- En Portainer Logs ves: "Error connecting to database"
- Health check falla constantemente

#### Causas Posibles

**A. PostgreSQL no está listo**

El backend intenta conectarse antes de que PostgreSQL esté completamente iniciado.

**Solución:**
```yaml
# Ya está configurado en PORTAINER_DOCKER_COMPOSE.yml
depends_on:
  postgres:
    condition: service_healthy
```

**Verificar:**
```bash
# Verificar que PostgreSQL esté healthy
docker exec qdrant-sync-postgres pg_isready -U postgres

# Ver logs de PostgreSQL
docker logs qdrant-sync-postgres
```

**B. Variable GEMINI_API_KEY no configurada**

**Solución:**
1. En Portainer: Stacks → bip2-production → Editor
2. Verifica sección "Environment variables"
3. Asegúrate de que `GEMINI_API_KEY` tiene un valor válido
4. Redesplegar el stack

**Verificar:**
```bash
# Ver variables de entorno del contenedor
docker exec bip2-backend env | grep GEMINI_API_KEY
```

**C. Error de conexión a Redis**

**Verificar:**
```bash
# Test Redis
docker exec qdrant-sync-redis redis-cli ping
# Debería responder: PONG

# Ver logs de Redis
docker logs qdrant-sync-redis
```

**D. Error de conexión a Qdrant**

**Verificar:**
```bash
# Test Qdrant
curl http://localhost:6333/collections

# Ver logs de Qdrant
docker logs efc-qdrant-local
```

---

### 2. Frontend muestra página en blanco o Error 502

#### Síntomas
- Navegador muestra página blanca
- Error "Bad Gateway" o "Cannot connect to backend"
- Console del navegador muestra errores de red

#### Causas Posibles

**A. Backend no está respondiendo**

**Verificar:**
```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Expected response:
# {"status":"ok","database":"connected","redis":"connected","qdrant":"connected"}
```

**Solución:**
Si el backend no responde, revisa la sección "Backend no inicia"

**B. Variable NEXT_PUBLIC_API_URL incorrecta**

**Verificar en Portainer:**
```yaml
# Debe ser:
environment:
  NEXT_PUBLIC_API_URL: http://backend:3001/api  # Para comunicación interna
  # O
  NEXT_PUBLIC_API_URL: http://TU_IP_SERVIDOR:3001/api  # Para acceso externo
```

**Solución:**
1. Edita el stack en Portainer
2. Actualiza `NEXT_PUBLIC_API_URL` con la URL correcta
3. Redesplega el stack

**C. CORS configurado incorrectamente**

**Verificar logs del backend:**
```bash
docker logs bip2-backend | grep CORS
```

**Solución:**
Actualiza la variable `CORS_ORIGIN` en el stack:
```yaml
CORS_ORIGIN: http://localhost:3011,http://frontend:3000,http://TU_IP_SERVIDOR:3011
```

---

### 3. Error al construir imágenes

#### Síntomas
- Deployment falla en Portainer
- Mensaje: "failed to build image"
- Error: "unable to resolve reference"

#### Causas Posibles

**A. Sin acceso a internet / GitHub**

**Verificar:**
```bash
# Test conectividad
ping github.com

# Test acceso a repositorio
curl -I https://github.com/alannreyes/bip2
```

**Solución:**
1. Verifica conectividad de red del servidor
2. Verifica que el firewall permita conexiones salientes a GitHub
3. Si usas proxy, configúralo en Docker:
   ```bash
   # /etc/systemd/system/docker.service.d/http-proxy.conf
   [Service]
   Environment="HTTP_PROXY=http://proxy:port"
   Environment="HTTPS_PROXY=http://proxy:port"
   ```

**B. Error en Dockerfile**

**Verificar:**
```bash
# Test build local del backend
cd backend
docker build -t test-backend .

# Test build local del frontend
cd frontend
docker build -t test-frontend .
```

**C. Falta curl en la imagen**

Ya está solucionado en los Dockerfiles actualizados. Si usas versión antigua:

```dockerfile
# backend/Dockerfile
RUN apk add --no-cache curl

# frontend/Dockerfile  
RUN apk add --no-cache curl
```

---

### 4. Problemas de Puertos

#### Síntomas
- Error: "port is already allocated"
- Deployment falla en Portainer

#### Verificar puertos en uso

```bash
# Ver todos los puertos en uso
sudo lsof -i -P -n | grep LISTEN

# Verificar puerto específico
sudo lsof -i :3001
```

#### Solución

**Opción A: Detener el servicio que usa el puerto**
```bash
# Identifica el PID
sudo lsof -i :3001

# Detén el proceso
sudo kill -9 PID
```

**Opción B: Cambiar el puerto en docker-compose**
```yaml
services:
  backend:
    ports:
      - "3002:3001"  # Cambiar 3001 a 3002
```

---

### 5. Sin espacio en disco

#### Síntomas
- Builds fallan inesperadamente
- Contenedores se detienen
- Error: "no space left on device"

#### Verificar espacio

```bash
# Espacio total
df -h

# Espacio usado por Docker
docker system df
```

#### Solución

**Limpieza básica:**
```bash
# Limpiar contenedores detenidos
docker container prune

# Limpiar imágenes no usadas
docker image prune -a

# Limpiar volúmenes no usados (¡CUIDADO!)
docker volume prune
```

**Limpieza completa:**
```bash
# ⚠️ ADVERTENCIA: Esto eliminará TODOS los recursos no usados
docker system prune -a --volumes

# Mejor hacer backup primero:
./backup-volumes.sh  # Si tienes el script
```

---

### 6. Healthcheck falla constantemente

#### Síntomas
- Contenedor muestra estado "unhealthy"
- Se reinicia automáticamente

#### Verificar healthcheck

```bash
# Ver detalles del healthcheck
docker inspect bip2-backend | grep -A 10 Health

# Ejecutar healthcheck manualmente
docker exec bip2-backend curl -f http://localhost:3001/api/health
```

#### Solución

**A. curl no instalado en la imagen**

Verifica que los Dockerfiles incluyan:
```dockerfile
RUN apk add --no-cache curl
```

**B. Servicio tarda mucho en iniciar**

Aumenta el `start_period` en docker-compose:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s  # Aumentar de 40s a 60s
```

---

### 7. Problemas de Red entre Contenedores

#### Síntomas
- Backend no puede conectarse a PostgreSQL
- Error: "getaddrinfo ENOTFOUND postgres"

#### Verificar red

```bash
# Listar redes Docker
docker network ls

# Inspeccionar red bip2
docker network inspect bip2_bip2-network
```

#### Solución

**Recrear la red:**
```bash
# Detener stack
docker compose -f PORTAINER_DOCKER_COMPOSE.yml down

# Eliminar red
docker network rm bip2_bip2-network

# Redesplegar
docker compose -f PORTAINER_DOCKER_COMPOSE.yml up -d
```

---

### 8. Variables de Entorno no se aplican

#### Síntomas
- Cambios en variables no se reflejan
- Backend usa valores por defecto

#### Verificar variables

```bash
# Ver todas las variables del contenedor
docker exec bip2-backend env

# Buscar variable específica
docker exec bip2-backend env | grep GEMINI_API_KEY
```

#### Solución

**En Portainer:**
1. Stacks → bip2-production → Editor
2. Modifica las variables de entorno
3. Haz clic en "Update the stack"
4. Marca "Re-pull image and redeploy"
5. Click en "Update"

**Desde CLI:**
```bash
# Recrear contenedor con nuevas variables
docker compose -f PORTAINER_DOCKER_COMPOSE.yml up -d --force-recreate backend
```

---

### 9. Volúmenes no persisten datos

#### Síntomas
- Datos se pierden al reiniciar contenedor
- Base de datos vacía después de restart

#### Verificar volúmenes

```bash
# Listar volúmenes
docker volume ls

# Inspeccionar volumen
docker volume inspect bip2_postgres_data

# Ver contenido del volumen
docker run --rm -v bip2_postgres_data:/data alpine ls -la /data
```

#### Solución

**Recrear volumen:**
```bash
# ⚠️ ADVERTENCIA: Esto ELIMINARÁ todos los datos

# 1. Hacer backup primero
docker run --rm -v bip2_postgres_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/postgres-backup.tar.gz -C /data .

# 2. Detener stack
docker compose -f PORTAINER_DOCKER_COMPOSE.yml down -v

# 3. Redesplegar
docker compose -f PORTAINER_DOCKER_COMPOSE.yml up -d
```

---

## 🔍 Comandos Útiles de Diagnóstico

### Ver todos los contenedores
```bash
docker ps -a
```

### Logs en tiempo real
```bash
# Todos los servicios
docker compose -f PORTAINER_DOCKER_COMPOSE.yml logs -f

# Servicio específico
docker logs -f bip2-backend
docker logs -f bip2-frontend
```

### Estadísticas de recursos
```bash
# Uso de CPU/Memoria de todos los contenedores
docker stats

# Contenedor específico
docker stats bip2-backend
```

### Inspeccionar contenedor
```bash
# Ver toda la configuración
docker inspect bip2-backend

# Ver solo variables de entorno
docker inspect bip2-backend | jq '.[0].Config.Env'

# Ver solo healthcheck
docker inspect bip2-backend | jq '.[0].State.Health'
```

### Ejecutar comandos dentro del contenedor
```bash
# Shell interactivo
docker exec -it bip2-backend sh

# Comando directo
docker exec bip2-backend node --version
docker exec bip2-backend npm list
```

### Verificar conectividad entre contenedores
```bash
# Desde backend hacia postgres
docker exec bip2-backend ping postgres

# Desde backend hacia redis
docker exec bip2-backend ping redis

# Desde backend hacia qdrant
docker exec bip2-backend ping qdrant
```

---

## 📊 Métricas y Monitoreo

### Verificar estado del sistema

```bash
# Espacio en disco
df -h

# Memoria RAM
free -h

# Uso de CPU
top

# Procesos Docker
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Portainer Stats

1. Ve a **Containers** en Portainer
2. Selecciona un contenedor
3. Pestaña **Stats** para ver métricas en tiempo real

---

## 🆘 Cuando todo lo demás falla

### Reset Completo (⚠️ ÚLTIMA OPCIÓN)

```bash
# 1. BACKUP primero (IMPORTANTE!)
# Backup PostgreSQL
docker exec qdrant-sync-postgres pg_dump -U postgres qdrant_sync > backup.sql

# Backup Qdrant
docker run --rm -v bip2_qdrant_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/qdrant-backup.tar.gz -C /data .

# 2. Detener y eliminar TODO
docker compose -f PORTAINER_DOCKER_COMPOSE.yml down -v

# 3. Limpiar imágenes
docker image prune -a

# 4. Limpiar volúmenes
docker volume prune

# 5. Limpiar redes
docker network prune

# 6. Redesplegar desde cero
docker compose -f PORTAINER_DOCKER_COMPOSE.yml up -d
```

---

## 📞 Obtener Ayuda

Si ninguna de estas soluciones funciona:

1. **Recopila información:**
   ```bash
   # Crea un reporte completo
   docker compose -f PORTAINER_DOCKER_COMPOSE.yml logs > full-logs.txt
   docker ps -a > containers.txt
   docker network ls > networks.txt
   docker volume ls > volumes.txt
   ```

2. **Revisa la documentación:**
   - [PORTAINER_COMPLETE_GUIDE.md](./PORTAINER_COMPLETE_GUIDE.md)
   - [DEPLOYMENT.md](./DEPLOYMENT.md)

3. **Abre un issue en GitHub** con:
   - Descripción del problema
   - Logs relevantes
   - Versiones de software (Docker, Ubuntu, etc.)
   - Pasos para reproducir el error

---

**Última actualización:** 2024
**Mantenedor:** Alann Reyes
