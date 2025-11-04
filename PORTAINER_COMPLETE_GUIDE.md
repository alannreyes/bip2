# 🐳 Guía Completa de Despliegue en Portainer (Ubuntu)

Esta guía te ayudará a desplegar BIP2 en un servidor Ubuntu usando Portainer.

## 📋 Requisitos Previos

### Servidor Ubuntu
- **SO**: Ubuntu 20.04 LTS o superior
- **RAM**: Mínimo 8GB (recomendado 16GB)
- **CPU**: Mínimo 4 cores
- **Disco**: Mínimo 50GB SSD
- **Puertos requeridos**: 3001, 3011, 3307, 5433, 6333, 6334, 6380

### Software Necesario
- Docker Engine 20.10+
- Docker Compose v2
- Portainer CE o BE

### Credenciales Requeridas
- API Key de Google Gemini ([Obtener aquí](https://makersuite.google.com/app/apikey))
- (Opcional) Credenciales de Azure AD si usarás autenticación Microsoft

---

## 🚀 Paso 1: Preparar el Servidor Ubuntu

### 1.1 Actualizar el Sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Instalar Docker
```bash
# Instalar dependencias
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Agregar repositorio oficial de Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar instalación
docker --version
docker compose version
```

### 1.3 Configurar Usuario Docker
```bash
# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Aplicar cambios (o reiniciar sesión)
newgrp docker
```

### 1.4 Instalar Portainer
```bash
# Crear volumen para Portainer
docker volume create portainer_data

# Instalar Portainer CE
docker run -d \
  -p 9000:9000 \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# Verificar que Portainer está corriendo
docker ps | grep portainer
```

**Acceder a Portainer**: `http://TU_IP_SERVIDOR:9000`

---

## 🔧 Paso 2: Configurar Portainer

### 2.1 Acceso Inicial
1. Abre tu navegador y ve a `http://TU_IP_SERVIDOR:9000`
2. Crea tu usuario administrador (primera vez)
3. Selecciona "Get Started" para administrar el entorno local
4. Verifica que puedes ver el entorno Docker local

### 2.2 Preparar Variables de Entorno
Antes de desplegar, prepara los siguientes valores:

**Variables REQUERIDAS:**
```bash
GEMINI_API_KEY=tu_api_key_de_gemini_aqui
JWT_SECRET=tu_clave_secreta_segura_minimo_32_caracteres
```

**Variables OPCIONALES (Azure AD):**
```bash
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
```

💡 **Tip**: Genera un JWT_SECRET seguro con:
```bash
openssl rand -base64 32
```

---

## 📦 Paso 3: Desplegar BIP2 en Portainer

### 3.1 Crear el Stack

1. **Navega a Stacks**
   - En el menú lateral de Portainer, haz clic en **Stacks**
   - Haz clic en **+ Add stack**

2. **Configurar el Stack**
   - **Name**: `bip2-production`
   - **Build method**: Selecciona **Web editor**

3. **Copiar el Docker Compose**
   - Abre el archivo `PORTAINER_DOCKER_COMPOSE.yml` de este repositorio
   - Copia TODO el contenido
   - Pégalo en el editor de Portainer

### 3.2 Configurar Variables de Entorno

En la sección **Environment variables** de Portainer:

**Opción A: Editor Simple**
1. Haz clic en **+ add environment variable**
2. Agrega cada variable:
   ```
   Name: GEMINI_API_KEY
   Value: tu_api_key_aqui
   ```
   ```
   Name: JWT_SECRET
   Value: tu_jwt_secret_aqui
   ```

**Opción B: Editor Avanzado**
1. Haz clic en **Advanced mode**
2. Pega el siguiente contenido (reemplaza con tus valores):
   ```env
   GEMINI_API_KEY=tu_api_key_de_gemini_aqui
   JWT_SECRET=tu_clave_secreta_segura_minimo_32_caracteres
   AZURE_AD_CLIENT_ID=
   AZURE_AD_CLIENT_SECRET=
   AZURE_AD_TENANT_ID=
   ```

### 3.3 Desplegar

1. Haz clic en **Deploy the stack**
2. Espera mientras Portainer:
   - Descarga las imágenes base
   - Construye las imágenes de backend y frontend
   - Crea los contenedores
   - Configura la red y volúmenes

⏱️ **Tiempo estimado**: 5-10 minutos en la primera vez

---

## ✅ Paso 4: Verificar el Despliegue

### 4.1 Verificar Contenedores

En Portainer:
1. Ve a **Containers**
2. Deberías ver 6 contenedores en estado **running**:
   - ✅ `bip2-backend`
   - ✅ `bip2-frontend`
   - ✅ `qdrant-sync-postgres`
   - ✅ `qdrant-sync-redis`
   - ✅ `efc-qdrant-local`
   - ✅ `efc-canasta-mysql`

### 4.2 Verificar Logs

Para cada contenedor:
1. Haz clic en el nombre del contenedor
2. Ve a la pestaña **Logs**
3. Busca mensajes de error

**Logs esperados en backend:**
```
[Nest] Application successfully started
Database connected successfully
Redis connected successfully
Qdrant connected successfully
```

### 4.3 Probar los Servicios

**Backend API:**
```bash
curl http://TU_IP_SERVIDOR:3001/api/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "qdrant": "connected"
}
```

**Frontend:**
- Abre tu navegador: `http://TU_IP_SERVIDOR:3011`
- Deberías ver la interfaz de BIP2

**API Swagger Documentation:**
- Abre: `http://TU_IP_SERVIDOR:3001/api/docs`
- Explora la documentación interactiva de la API

---

## 🔍 Paso 5: Monitoreo y Mantenimiento

### 5.1 Ver Logs en Tiempo Real

En Portainer:
1. Ve a **Containers** → Selecciona un contenedor
2. Pestaña **Logs** → Activa **Auto-refresh logs**

### 5.2 Ver Estadísticas de Recursos

En Portainer:
1. Ve a **Containers** → Selecciona un contenedor
2. Pestaña **Stats** para ver CPU, memoria, red

### 5.3 Reiniciar Servicios

Si necesitas reiniciar un servicio:
1. Ve a **Containers**
2. Selecciona el contenedor
3. Haz clic en **Restart**

### 5.4 Ver Volúmenes

Para verificar los datos persistentes:
1. Ve a **Volumes**
2. Deberías ver:
   - `bip2_postgres_data`
   - `bip2_redis_data`
   - `bip2_mysql_data`
   - `bip2_qdrant_data`

---

## 🔒 Seguridad y Mejores Prácticas

### ✅ Checklist de Seguridad

- [ ] JWT_SECRET es único y tiene al menos 32 caracteres
- [ ] GEMINI_API_KEY está configurada correctamente
- [ ] Las contraseñas de PostgreSQL y MySQL son seguras (cambiar en producción)
- [ ] El firewall permite solo los puertos necesarios
- [ ] Los volúmenes tienen backups automáticos configurados
- [ ] Portainer está protegido con usuario y contraseña fuertes

### 🔥 Configuración de Firewall (UFW)

```bash
# Habilitar UFW
sudo ufw enable

# Permitir SSH
sudo ufw allow 22/tcp

# Permitir Portainer
sudo ufw allow 9000/tcp
sudo ufw allow 9443/tcp

# Permitir BIP2
sudo ufw allow 3001/tcp  # Backend API
sudo ufw allow 3011/tcp  # Frontend

# Verificar reglas
sudo ufw status
```

### 📁 Backups

**Backup de Volúmenes:**
```bash
# Backup de PostgreSQL
docker run --rm \
  -v bip2_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup-$(date +%Y%m%d).tar.gz -C /data .

# Backup de Qdrant
docker run --rm \
  -v bip2_qdrant_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/qdrant-backup-$(date +%Y%m%d).tar.gz -C /data .
```

---

## 🐛 Troubleshooting

### Problema: Backend no inicia

**Síntomas:**
- Contenedor `bip2-backend` se reinicia constantemente
- Logs muestran errores de conexión

**Solución:**
1. Verifica que PostgreSQL esté healthy:
   ```bash
   docker exec qdrant-sync-postgres pg_isready -U postgres
   ```
2. Verifica las variables de entorno:
   - Ve a **Stacks** → `bip2-production` → **Editor**
   - Revisa que `GEMINI_API_KEY` esté configurada
3. Revisa los logs detallados:
   ```bash
   docker logs bip2-backend --tail 100
   ```

### Problema: Frontend no carga

**Síntomas:**
- Frontend muestra página en blanco
- Error 502 Bad Gateway

**Solución:**
1. Verifica que el backend esté corriendo:
   ```bash
   curl http://localhost:3001/api/health
   ```
2. Revisa los logs del frontend:
   ```bash
   docker logs bip2-frontend --tail 100
   ```
3. Verifica la variable `NEXT_PUBLIC_API_URL` en el stack

### Problema: Puerto ya en uso

**Síntomas:**
- Error al desplegar: "port is already allocated"

**Solución:**
1. Identifica qué proceso usa el puerto:
   ```bash
   sudo lsof -i :3001
   ```
2. Detén el proceso conflictivo o cambia el puerto en el docker-compose

### Problema: Sin espacio en disco

**Síntomas:**
- Builds fallan
- Contenedores se detienen inesperadamente

**Solución:**
1. Verifica el espacio:
   ```bash
   df -h
   ```
2. Limpia recursos Docker no usados:
   ```bash
   docker system prune -a --volumes
   ```
   ⚠️ **Cuidado**: Esto eliminará volúmenes no usados. Haz backup primero.

---

## 🔄 Actualizar la Aplicación

### Método 1: Desde Portainer (Recomendado)

1. Ve a **Stacks** → `bip2-production`
2. Haz clic en **Pull and redeploy**
3. Portainer descargará las últimas imágenes y reconstruirá

### Método 2: Manual

```bash
# Detener el stack
docker compose -f PORTAINER_DOCKER_COMPOSE.yml down

# Limpiar imágenes antiguas
docker image prune -a

# Reconstruir y desplegar
docker compose -f PORTAINER_DOCKER_COMPOSE.yml up -d --build
```

---

## 📊 Servicios Desplegados

| Servicio | Puerto | URL | Descripción |
|----------|--------|-----|-------------|
| **Frontend** | 3011 | http://TU_IP:3011 | Interfaz web de administración |
| **Backend API** | 3001 | http://TU_IP:3001/api | API REST de BIP2 |
| **API Docs** | 3001 | http://TU_IP:3001/api/docs | Documentación Swagger |
| **PostgreSQL** | 5433 | localhost:5433 | Base de datos principal |
| **Redis** | 6380 | localhost:6380 | Cache y colas |
| **Qdrant** | 6333 | http://TU_IP:6333 | Vector database |
| **MySQL** | 3307 | localhost:3307 | Base de datos secundaria |

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs en Portainer
2. Consulta la sección de Troubleshooting
3. Verifica la documentación en `/DEPLOYMENT.md`
4. Abre un issue en GitHub

---

## ✅ Checklist Post-Despliegue

- [ ] Todos los contenedores están en estado **running**
- [ ] Backend responde en `/api/health`
- [ ] Frontend carga correctamente
- [ ] API Docs accesible en `/api/docs`
- [ ] Firewall configurado correctamente
- [ ] Backups automáticos configurados
- [ ] Monitoreo de logs configurado
- [ ] Variables de entorno seguras

---

**¡Felicitaciones! BIP2 está desplegado y funcionando en Portainer.** 🎉
