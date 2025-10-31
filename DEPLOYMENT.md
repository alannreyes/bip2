# Guía de Despliegue - BIP2 Semantic Search Platform

Esta guía te ayudará a desplegar la aplicación en un servidor Ubuntu con Docker Compose, Portainer y Traefik.

## 📋 Requisitos Previos

### Servidor
- **SO**: Ubuntu 20.04 o superior
- **RAM**: Mínimo 8GB (recomendado 16GB)
- **CPU**: Mínimo 4 cores
- **Disco**: Mínimo 50GB SSD
- **Acceso**: SSH con permisos sudo

### Dominios
- Dominio configurado apuntando al servidor (ej: `bip.tuempresa.com`)
- Subdominios configurados:
  - `api.bip.tuempresa.com` → Backend API
  - `bip.tuempresa.com` → Frontend

### Servicios Externos
- API Key de Google Gemini (https://makersuite.google.com/app/apikey)
- Acceso a bases de datos MS SQL Server (EFC catalog)

## 🛠️ Instalación Inicial del Servidor

### 1. Actualizar el Sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Docker

```bash
# Instalar dependencias
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Agregar repositorio oficial de Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Verificar instalación
docker --version
```

### 3. Instalar Docker Compose

```bash
# Instalar Docker Compose v2
sudo apt install docker-compose-plugin -y

# Verificar instalación
docker compose version
```

### 4. Configurar Usuario Docker

```bash
# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Aplicar cambios (o reiniciar sesión)
newgrp docker
```

### 5. Instalar Portainer (Opcional pero Recomendado)

```bash
# Crear volumen para Portainer
docker volume create portainer_data

# Instalar Portainer
docker run -d \
  -p 9000:9000 \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Accede a Portainer: `http://TU_IP_SERVIDOR:9000`

## 🚀 Despliegue de la Aplicación

### 1. Clonar el Repositorio

```bash
# Crear directorio de proyectos
mkdir -p ~/proyectos
cd ~/proyectos

# Clonar repositorio
git clone https://github.com/alannreyes/bip2.git
cd bip2
```

### 2. Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.production.example .env.production

# Editar con tus valores
nano .env.production
```

**Variables críticas a configurar:**

```bash
# --- Database ---
POSTGRES_PASSWORD=tu_password_super_seguro_123

# --- Redis ---
REDIS_PASSWORD=tu_redis_password_456

# --- API Keys ---
GEMINI_API_KEY=tu_api_key_de_gemini

# --- Security ---
JWT_SECRET=token_jwt_muy_largo_y_aleatorio_min_32_caracteres

# --- Domains ---
FRONTEND_DOMAIN=bip.tuempresa.com
BACKEND_DOMAIN=api.bip.tuempresa.com

# --- CORS ---
CORS_ORIGIN=https://bip.tuempresa.com

# --- Frontend ---
NEXT_PUBLIC_API_URL=https://api.bip.tuempresa.com/api
```

**Generar passwords seguros:**

```bash
# Password PostgreSQL
openssl rand -base64 32

# Password Redis
openssl rand -base64 32

# JWT Secret
openssl rand -base64 48
```

### 3. Configurar Traefik

#### Crear red de Traefik:

```bash
docker network create traefik-public
```

#### Configurar email en traefik.yml:

```bash
nano traefik-data/traefik.yml
```

Cambiar `admin@yourcompany.com` por tu email real.

#### Iniciar Traefik:

```bash
docker compose -f traefik-compose.yml up -d
```

Verificar logs:

```bash
docker logs traefik -f
```

### 4. Desplegar la Aplicación

```bash
# Construir e iniciar todos los servicios
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. Verificar el Despliegue

```bash
# Ver estado de contenedores
docker compose -f docker-compose.prod.yml ps

# Ver logs
docker compose -f docker-compose.prod.yml logs -f
```

Deberías ver 5 contenedores corriendo:
- ✅ bip-postgres
- ✅ bip-redis
- ✅ bip-qdrant
- ✅ bip-backend
- ✅ bip-frontend

### 6. Configurar Base de Datos (Primera Vez)

Las migraciones de TypeORM se ejecutan automáticamente al iniciar el backend.

Para verificar:

```bash
docker logs bip-backend | grep Migration
```

## 🔧 Configuración Post-Despliegue

### 1. Crear Primer Data Source

Conectarse a la API para crear el primer datasource:

```bash
curl -X POST https://api.bip.tuempresa.com/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "EFC Catalog 200k",
    "type": "mssql",
    "config": {
      "host": "TU_SQL_SERVER_HOST",
      "port": 1433,
      "username": "TU_USUARIO",
      "password": "TU_PASSWORD",
      "database": "NOMBRE_BD"
    },
    "query": "SELECT TOP 10 * FROM dbo.catalogo_efc_v1",
    "embeddingFields": ["field1", "field2"],
    "collectionName": "catalogo_efc_200k"
  }'
```

### 2. Verificar Qdrant

Acceder a Qdrant UI (solo internamente):

```bash
# Port forward temporal para verificación
docker exec -it bip-qdrant wget -qO- http://localhost:6333/dashboard/
```

### 3. Configurar Firewall (UFW)

```bash
# Habilitar UFW
sudo ufw enable

# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Permitir Portainer (si se usa)
sudo ufw allow 9000/tcp
sudo ufw allow 9443/tcp

# Verificar reglas
sudo ufw status
```

## 📊 Monitoreo y Mantenimiento

### Ver Logs

```bash
# Todos los servicios
docker compose -f docker-compose.prod.yml logs -f

# Solo backend
docker logs bip-backend -f

# Solo frontend
docker logs bip-frontend -f
```

### Reiniciar Servicios

```bash
# Reiniciar todo
docker compose -f docker-compose.prod.yml restart

# Reiniciar solo backend
docker compose -f docker-compose.prod.yml restart backend

# Reiniciar solo frontend
docker compose -f docker-compose.prod.yml restart frontend
```

### Actualizar la Aplicación

```bash
# 1. Hacer pull de cambios
git pull origin main

# 2. Reconstruir y reiniciar
docker compose -f docker-compose.prod.yml up -d --build

# 3. Verificar
docker compose -f docker-compose.prod.yml ps
```

### Backups

#### Backup de PostgreSQL:

```bash
# Crear backup
docker exec bip-postgres pg_dump -U postgres qdrant_catalog_sync > backup_$(date +%Y%m%d).sql

# Restaurar backup
cat backup_20231029.sql | docker exec -i bip-postgres psql -U postgres qdrant_catalog_sync
```

#### Backup de Qdrant:

```bash
# Los datos están en el volumen Docker
docker run --rm -v bip2_qdrant_data:/source -v $(pwd):/backup alpine tar czf /backup/qdrant_backup_$(date +%Y%m%d).tar.gz -C /source .
```

### Limpieza

```bash
# Eliminar contenedores antiguos
docker system prune -a

# Eliminar volúmenes huérfanos
docker volume prune
```

## 🔒 Seguridad

### Checklist de Seguridad:

- [ ] Cambiar todas las contraseñas por defecto
- [ ] Configurar firewall (UFW)
- [ ] Usar HTTPS con certificados válidos
- [ ] Mantener Docker actualizado
- [ ] Revisar logs regularmente
- [ ] Configurar backups automáticos
- [ ] Limitar acceso SSH (solo IP conocidas)
- [ ] Habilitar 2FA en Portainer

### Hardening Adicional:

```bash
# Deshabilitar login de root por SSH
sudo nano /etc/ssh/sshd_config
# Cambiar: PermitRootLogin no

# Reiniciar SSH
sudo systemctl restart sshd

# Instalar fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 🐛 Troubleshooting

### Problema: Contenedor no inicia

```bash
# Ver logs detallados
docker logs NOMBRE_CONTENEDOR --tail 100

# Verificar recursos del sistema
docker stats

# Verificar espacio en disco
df -h
```

### Problema: SSL no funciona

```bash
# Verificar logs de Traefik
docker logs traefik -f | grep acme

# Verificar que dominios apuntan al servidor
nslookup bip.tuempresa.com

# Verificar puertos abiertos
sudo netstat -tulpn | grep :443
```

### Problema: Backend no conecta a base de datos

```bash
# Verificar conectividad desde contenedor
docker exec -it bip-backend ping postgres

# Verificar variables de entorno
docker exec -it bip-backend env | grep DATABASE

# Verificar logs de PostgreSQL
docker logs bip-postgres
```

### Problema: Alto uso de memoria

```bash
# Ver uso de memoria por contenedor
docker stats --no-stream

# Limitar memoria de un servicio (docker-compose.prod.yml):
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

## 📞 Soporte

Para problemas o preguntas:
- Revisar logs: `docker compose -f docker-compose.prod.yml logs`
- Verificar estado: `docker compose -f docker-compose.prod.yml ps`
- Documentación de Traefik: https://doc.traefik.io/traefik/
- Documentación de Docker: https://docs.docker.com/

## 🔄 Actualizaciones

### Minor Updates (sin cambios en DB):

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Major Updates (con cambios en DB):

```bash
# 1. Backup primero
docker exec bip-postgres pg_dump -U postgres qdrant_catalog_sync > backup_pre_update.sql

# 2. Actualizar código
git pull

# 3. Detener servicios
docker compose -f docker-compose.prod.yml down

# 4. Rebuild
docker compose -f docker-compose.prod.yml up -d --build

# 5. Verificar migraciones
docker logs bip-backend | grep Migration
```

---

**¡Despliegue completado! 🎉**

Accede a tu aplicación en: `https://bip.tuempresa.com`
