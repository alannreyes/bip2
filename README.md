# 🗄️ Qdrant Catalog Sync Platform

Sistema de gestión de catálogos vectoriales multi-fuente con búsqueda semántica usando Qdrant, Gemini AI y NestJS.

---

## 🎯 Características

- ✅ **Gestión de múltiples fuentes de datos** (MS SQL, MySQL, PostgreSQL)
- ✅ **Sincronización automática** con cron jobs configurables
- ✅ **Embeddings con Gemini AI** (3072 dimensiones con MRL)
- ✅ **Almacenamiento vectorial** en Qdrant
- ✅ **Webhooks** para actualizaciones en tiempo real
- ✅ **Búsqueda por imagen** usando Gemini 2.0 Flash Vision
- ✅ **Frontend de administración** con React/Next.js
- ✅ **Self-service** configuración completa desde UI

---

## 📦 Tecnologías

### Backend:
- **NestJS** - Framework Node.js
- **TypeORM** - ORM para PostgreSQL
- **Bull** - Queue management con Redis
- **Qdrant Client** - Vector database
- **Google Generative AI** - Embeddings y Vision
- **TypeScript** - Lenguaje tipado

### Frontend:
- **Next.js 14** - React framework
- **TailwindCSS** - Styling
- **Shadcn/ui** - Component library
- **TanStack Query** - Data fetching

### Infrastructure:
- **PostgreSQL** - Metadata database
- **Redis** - Queue y cache
- **Qdrant** - Vector database (externo)
- **Docker** - Containerización

---

## 🚀 Setup Local

### 1. Prerrequisitos

- Node.js 20+
- Docker y Docker Compose
- Qdrant corriendo en `192.168.2.6:6333`

### 2. Clonar e Instalar

```bash
# Clonar repositorio
cd /opt/proyectos/bip2

# Instalar dependencias backend
cd backend
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Configurar Variables de Entorno

Editar `backend/.env`:

```env
# Database (PostgreSQL)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres123
DATABASE_NAME=qdrant_catalog_sync

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Qdrant (externo)
QDRANT_HOST=192.168.2.6
QDRANT_PORT=6333

# Gemini API
GEMINI_API_KEY=AIzaSyCjvj7BHkpcbglS4s7UgAFUMTDa0Mzb5oo

# Microsoft Entra ID (configurar después de crear app en Azure)
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=your-tenant-id

# JWT
JWT_SECRET=cambiar-esto-en-produccion

# CORS
CORS_ORIGIN=http://localhost:3000
```

### 4. Iniciar con Docker Compose

```bash
# Desde la raíz del proyecto
docker-compose up -d

# Ver logs
docker-compose logs -f backend
```

Esto iniciará:
- PostgreSQL (puerto 5432)
- Redis (puerto 6379)
- Backend API (puerto 3001)

### 5. Desarrollo Local (sin Docker)

```bash
# Terminal 1: PostgreSQL
docker run -d \
  --name qdrant-postgres \
  -e POSTGRES_DB=qdrant_catalog_sync \
  -e POSTGRES_PASSWORD=postgres123 \
  -p 5432:5432 \
  postgres:16-alpine

# Terminal 2: Redis
docker run -d \
  --name qdrant-redis \
  -p 6379:6379 \
  redis:7-alpine

# Terminal 3: Backend
cd backend
npm run start:dev
```

---

## 📚 API Endpoints

### Health Check
```
GET /api/health              - Health check completo
GET /api/health/database     - Check PostgreSQL
GET /api/health/redis        - Check Redis
GET /api/health/qdrant       - Check Qdrant
```

### Datasources
```
POST   /api/datasources                    - Crear fuente de datos
GET    /api/datasources                    - Listar todas
GET    /api/datasources/:id                - Obtener una
PUT    /api/datasources/:id                - Actualizar
DELETE /api/datasources/:id                - Eliminar
POST   /api/datasources/:id/test           - Probar conexión
GET    /api/datasources/:id/preview        - Preview de datos
POST   /api/datasources/:id/validate-query - Validar query SQL
POST   /api/datasources/test-connection    - Test sin guardar
```

### Collections (Qdrant)
```
POST   /api/collections        - Crear colección
GET    /api/collections        - Listar colecciones
GET    /api/collections/:name  - Obtener info de colección
DELETE /api/collections/:name  - Eliminar colección
```

---

## 🔧 Configurar Primera Fuente de Datos

### Ejemplo: Catálogo Maestro MS SQL

```bash
curl -X POST http://localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Catálogo Maestro BIP",
    "type": "mssql",
    "connectionConfig": {
      "host": "192.168.2.5",
      "port": 1433,
      "user": "sa",
      "password": "tu-password",
      "database": "BIPDB"
    },
    "queryTemplate": "SELECT a.ART_CODART AS codigo, a.ART_DESART AS descripcion, a.ART_PARAM3 AS marca, a.ART_CODFABRICA AS codigo_fabricante, a.ART_PARAM1 AS categoria, a.ART_PARAM2 AS presentacion, a.ART_DESART5 AS color, a.ART_FLGSTKDIST AS stock_disponible, a.ART_FLGLSTPRE AS precio_lista FROM ar0000 a WHERE a.ART_ESTREG = '\''A'\'' AND a.ART_CODFAM <= '\''47'\'' ORDER BY a.ART_CODART OFFSET {{offset}} ROWS FETCH NEXT {{limit}} ROWS ONLY",
    "fieldMapping": {
      "codigo": "codigo_original",
      "descripcion": "descripcion",
      "marca": "marca",
      "codigo_fabricante": "codigo_fabricante",
      "categoria": "categoria",
      "presentacion": "presentacion",
      "color": "color",
      "stock_disponible": "stock_available",
      "precio_lista": "price_list_available"
    },
    "embeddingFields": ["descripcion", "marca", "presentacion", "color"],
    "qdrantCollection": "catalogo_maestro_bip_768",
    "syncSchedule": "0 2 * * *",
    "webhookEnabled": true,
    "description": "Catálogo principal de productos industriales BIP"
  }'
```

### Probar Conexión

```bash
curl -X POST http://localhost:3001/api/datasources/{id}/test
```

### Preview de Datos

```bash
curl http://localhost:3001/api/datasources/{id}/preview?limit=5
```

---

## 🐳 Docker Commands

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f backend

# Reiniciar backend
docker-compose restart backend

# Detener todos los servicios
docker-compose down

# Eliminar todo (incluye volúmenes)
docker-compose down -v
```

---

## 📊 Estado del Proyecto

### ✅ FASE 1 Completada (60%)

**Backend Core:**
- ✅ Estructura NestJS completa
- ✅ Entidades TypeORM (Datasource, SyncJob, SyncError, QdrantCollection)
- ✅ Database connectors (MSSQL, MySQL, PostgreSQL)
- ✅ Datasources CRUD completo
- ✅ Query validator y preview
- ✅ Qdrant integration completa
- ✅ Gemini embeddings (text + vision)
- ✅ Health checks
- ✅ Docker Compose configurado

### 🔄 En Desarrollo (FASE 1 restante - 40%)

**Sync Engine:**
- ⏳ Sync service (full, incremental, webhook)
- ⏳ Bull processors para jobs
- ⏳ Progress tracking en tiempo real
- ⏳ Error handling y retry logic

**Webhooks:**
- ⏳ Webhook controller
- ⏳ Signature validation
- ⏳ Batch processing

**Scheduler:**
- ⏳ Cron jobs automáticos
- ⏳ Job monitoring

**Search:**
- ⏳ Image search endpoint

**Auth:**
- ⏳ Microsoft Entra ID integration
- ⏳ JWT strategy
- ⏳ Auth guards

### 📋 Pendiente (FASE 2)

**Frontend:**
- ⏳ Next.js 14 setup
- ⏳ Dashboard
- ⏳ Datasource wizard (5 pasos)
- ⏳ Sync monitoring UI
- ⏳ Collections management
- ⏳ Image search UI
- ⏳ Authentication flow

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 🔐 Configurar Microsoft Entra ID

### 1. Crear App en Azure Portal

1. Ir a https://portal.azure.com
2. Azure Active Directory → App registrations → New registration
3. Nombre: "Qdrant Catalog Sync Platform"
4. Redirect URI: `http://localhost:3001/api/auth/callback`
5. Copiar:
   - Application (client) ID
   - Directory (tenant) ID
6. Certificates & secrets → New client secret → Copiar valor

### 2. Configurar en .env

```env
AZURE_AD_CLIENT_ID=tu-client-id
AZURE_AD_CLIENT_SECRET=tu-client-secret
AZURE_AD_TENANT_ID=tu-tenant-id
```

---

## 📖 Webhook API

### Endpoint

```
POST /api/webhooks/:datasourceId/sync
Authorization: Bearer {webhook_secret}
Content-Type: application/json
```

### Body

```json
{
  "collection": "catalogo_maestro_bip_768",
  "codes": [
    "01010584",
    "01010585",
    "42060762"
  ]
}
```

### Respuesta

```json
{
  "jobId": "uuid",
  "totalCodes": 3,
  "status": "queued",
  "message": "Sync job created, processing in background"
}
```

### Comportamiento

- Si código existe en BD origen → UPSERT en Qdrant
- Si código NO existe en BD origen → DELETE de Qdrant
- Máximo 500 códigos por request

---

## 🐛 Troubleshooting

### Error: Cannot connect to PostgreSQL

```bash
# Verificar que PostgreSQL está corriendo
docker ps | grep postgres

# Ver logs
docker logs qdrant-catalog-postgres

# Reiniciar
docker-compose restart postgres
```

### Error: Cannot connect to Qdrant

```bash
# Verificar que Qdrant está corriendo en 192.168.2.6
curl http://192.168.2.6:6333/collections

# Verificar health check
curl http://localhost:3001/api/health/qdrant
```

### Error: Gemini API failed

```bash
# Verificar API key en .env
echo $GEMINI_API_KEY

# Test directo
curl http://localhost:3001/api/health
```

---

## 📧 Contacto

- **Autor:** Alann Reyes
- **Email:** alannreyesj@gmail.com

---

## 📄 Licencia

MIT
