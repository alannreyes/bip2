# 🚀 Guía Post-Deployment - Configuración Inicial

Esta guía es para **DevOps** después de levantar exitosamente los contenedores en producción.

**IMPORTANTE:** La aplicación NO será funcional hasta completar estos pasos. Los contenedores estarán corriendo, pero necesitas configurar servicios externos y crear el primer datasource.

---

## ✅ Pre-requisitos

Antes de comenzar, asegúrate de que:

- [ ] Todos los contenedores están corriendo (`docker compose -f docker-compose.prod.yml ps`)
- [ ] El backend responde en `https://api.TU_DOMINIO/api/health`
- [ ] El frontend carga en `https://TU_DOMINIO`
- [ ] Los certificados SSL están activos (Traefik + Let's Encrypt)

---

## 📋 Paso 1: Obtener API Key de Google Gemini

La aplicación **requiere** una API Key de Google Gemini para:
- Generar embeddings de texto (búsqueda semántica)
- Análisis de imágenes
- Detección de duplicados

### Cómo Obtener la API Key:

1. **Ir a Google AI Studio:**
   ```
   https://aistudio.google.com/app/apikey
   ```

2. **Crear un nuevo proyecto** (si no tienes uno)

3. **Generar API Key:**
   - Click en "Create API Key"
   - Selecciona tu proyecto
   - Copia la API key generada

4. **Actualizar .env.production:**
   ```bash
   # En el servidor
   cd ~/proyectos/bip2
   nano .env.production

   # Actualizar esta línea:
   GEMINI_API_KEY=TU_API_KEY_AQUI
   ```

5. **Reiniciar el backend:**
   ```bash
   docker compose -f docker-compose.prod.yml restart backend
   ```

6. **Verificar:**
   ```bash
   # Debe aparecer "Gemini AI initialized" en los logs
   docker logs bip-backend | grep Gemini
   ```

### Límites de la API:

- **Free tier:** 15 requests/minuto, 1,500 requests/día
- **Paid tier:** Consultar https://ai.google.dev/pricing

Para producción se recomienda:
- Configurar billing en Google Cloud
- Aumentar cuotas si es necesario
- Monitorear uso

---

## 📋 Paso 2: Verificar Conectividad de Servicios

### 2.1 Health Check Completo

```bash
curl https://api.TU_DOMINIO/api/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-31T...",
  "services": {
    "database": {
      "healthy": true,
      "message": "Database is healthy"
    },
    "qdrant": {
      "healthy": true,
      "message": "Qdrant is healthy"
    },
    "redis": {
      "healthy": true,
      "message": "Redis is healthy"
    }
  }
}
```

### 2.2 Si Qdrant aparece "unhealthy":

```bash
# Verificar que Qdrant esté corriendo
docker logs bip-qdrant

# Verificar conectividad desde el backend
docker exec bip-backend wget -qO- http://qdrant:6333/health
```

---

## 📋 Paso 3: Configurar el Primer Datasource

La aplicación necesita al menos **un datasource** configurado para ser funcional.

### 3.1 Requisitos del Datasource

Necesitas acceso a una base de datos con datos de productos. Soportados:
- **MS SQL Server** (recomendado para EFC)
- **MySQL**
- **PostgreSQL**

### 3.2 Información Necesaria

Antes de crear el datasource, ten a mano:

- **Host:** Dirección IP o hostname del servidor de base de datos
- **Puerto:** Ej: 1433 (SQL Server), 3306 (MySQL), 5432 (PostgreSQL)
- **Usuario:** Usuario con permisos de lectura
- **Contraseña:** Contraseña del usuario
- **Nombre de BD:** Nombre de la base de datos
- **Query SQL:** Query que devuelve los productos (ver ejemplos abajo)

### 3.3 Acceder a Swagger UI

```
https://api.TU_DOMINIO/api/docs
```

### 3.4 Crear Datasource vía API

**Opción A: Usar Swagger UI (Recomendado)**

1. Ir a `https://api.TU_DOMINIO/api/docs`
2. Expandir `POST /api/datasources`
3. Click en "Try it out"
4. Pegar el JSON de ejemplo (ver abajo)
5. Click en "Execute"

**Opción B: Usar cURL**

```bash
curl -X POST https://api.TU_DOMINIO/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Catálogo EFC - Productos Industriales",
    "type": "mssql",
    "connectionConfig": {
      "host": "TU_SQL_SERVER_IP",
      "port": 1433,
      "user": "TU_USUARIO",
      "password": "TU_PASSWORD",
      "database": "NOMBRE_BD",
      "options": {
        "encrypt": true,
        "trustServerCertificate": true,
        "connectionTimeout": 30000,
        "requestTimeout": 30000
      }
    },
    "queryTemplate": "SELECT codigo_producto AS id, descripcion, marca, categoria, precio, stock FROM productos WHERE estado = '\''A'\'' ORDER BY codigo_producto OFFSET {{offset}} ROWS FETCH NEXT {{limit}} ROWS ONLY",
    "fieldMapping": {
      "id": "codigo",
      "descripcion": "descripcion",
      "marca": "marca",
      "categoria": "categoria",
      "precio": "precio",
      "stock": "stock"
    },
    "idField": "id",
    "embeddingFields": ["descripcion", "marca", "categoria"],
    "qdrantCollection": "catalogo_productos",
    "batchSize": 100,
    "batchDelay": 1000,
    "syncSchedule": "0 2 * * *",
    "description": "Catálogo principal de productos industriales"
  }'
```

### 3.5 Notas Importantes sobre el Query

**El query debe incluir:**
- `{{offset}}` y `{{limit}}` para paginación
- Un campo único como ID (ej: código de producto)
- Campos de texto para generar embeddings (descripción, marca, etc.)

**Ejemplo para SQL Server:**
```sql
SELECT
  codigo AS id,
  descripcion,
  marca,
  categoria
FROM productos
WHERE estado = 'A'
ORDER BY codigo
OFFSET {{offset}} ROWS
FETCH NEXT {{limit}} ROWS ONLY
```

**Ejemplo para MySQL:**
```sql
SELECT
  codigo AS id,
  descripcion,
  marca,
  categoria
FROM productos
WHERE estado = 'A'
ORDER BY codigo
LIMIT {{limit}} OFFSET {{offset}}
```

---

## 📋 Paso 4: Probar la Conexión del Datasource

```bash
# Obtener el ID del datasource creado
curl https://api.TU_DOMINIO/api/datasources

# Probar la conexión (reemplazar DATASOURCE_ID)
curl -X POST https://api.TU_DOMINIO/api/datasources/DATASOURCE_ID/test
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Connection successful",
  "rowCount": 1234,
  "sampleData": [...]
}
```

---

## 📋 Paso 5: Sincronizar Datos (Primera Sincronización)

Una vez que el datasource está configurado y probado:

```bash
# Iniciar sincronización completa
curl -X POST https://api.TU_DOMINIO/api/sync/full/DATASOURCE_ID
```

**Respuesta:**
```json
{
  "jobId": "uuid-del-job",
  "status": "queued",
  "message": "Full sync job created"
}
```

### Monitorear el Progreso:

```bash
# Ver estado del job
curl https://api.TU_DOMINIO/api/sync/jobs/JOB_ID

# Ver logs en tiempo real
docker logs -f bip-backend | grep "Sync"
```

**Tiempo estimado:**
- 10,000 productos: ~5-10 minutos
- 100,000 productos: ~30-60 minutos
- 200,000 productos: ~1-2 horas

---

## 📋 Paso 6: Verificar que la Búsqueda Funcione

### 6.1 Probar Búsqueda de Texto

```bash
curl -X POST https://api.TU_DOMINIO/api/search/text \
  -H "Content-Type: application/json" \
  -d '{
    "query": "motor eléctrico",
    "collections": ["catalogo_productos"],
    "limit": 5
  }'
```

**Respuesta esperada:**
```json
{
  "results": [
    {
      "id": "PROD001",
      "descripcion": "Motor eléctrico trifásico 5HP",
      "marca": "WEG",
      "score": 0.95,
      ...
    }
  ],
  "total": 156,
  "query": "motor eléctrico"
}
```

### 6.2 Probar desde el Frontend

1. Ir a `https://TU_DOMINIO`
2. Usar la barra de búsqueda
3. Ingresar: "motor eléctrico" o cualquier producto
4. Verificar que aparezcan resultados

---

## 📋 Paso 7: Configurar Sincronización Automática (Opcional)

El datasource ya tiene configurado `syncSchedule: "0 2 * * *"` (todos los días a las 2 AM).

Para verificar que el cron está activo:

```bash
# Ver logs del scheduler
docker logs bip-backend | grep "Scheduled sync"
```

---

## ✅ Checklist Final de Verificación

- [ ] API Key de Gemini configurada y funcionando
- [ ] Health check muestra todos los servicios "healthy"
- [ ] Al menos un datasource creado y probado
- [ ] Primera sincronización completada exitosamente
- [ ] Búsqueda de texto devuelve resultados
- [ ] Frontend carga y muestra resultados de búsqueda
- [ ] Certificados SSL activos (candado verde en el navegador)
- [ ] Logs no muestran errores críticos

```bash
# Verificación rápida
curl https://api.TU_DOMINIO/api/health
curl https://api.TU_DOMINIO/api/datasources
curl https://api.TU_DOMINIO/api/collections
```

---

## 🔧 Troubleshooting

### Problema: "Gemini API failed"

```bash
# Verificar que la API key está configurada
docker exec bip-backend printenv | grep GEMINI_API_KEY

# Verificar logs
docker logs bip-backend | grep -i gemini
```

**Solución:**
- Verificar que la API key es válida
- Verificar que no has excedido los límites de cuota
- Reiniciar el backend: `docker compose -f docker-compose.prod.yml restart backend`

### Problema: "Database connection failed"

```bash
# Verificar conectividad
docker exec bip-backend ping -c 3 TU_DB_HOST

# Verificar credenciales
# Asegúrate de que el servidor SQL permite conexiones desde la IP del servidor
```

### Problema: "Sync job failed"

```bash
# Ver errores del job
curl https://api.TU_DOMINIO/api/sync/errors/JOB_ID

# Ver logs detallados
docker logs bip-backend | grep -A 20 "Sync error"
```

---

## 📞 Soporte

Si encuentras problemas:

1. **Revisar logs:**
   ```bash
   docker compose -f docker-compose.prod.yml logs -f
   ```

2. **Verificar documentación:**
   - `DEPLOYMENT.md` - Guía completa de deployment
   - `QUICK_START.md` - Guía rápida
   - Swagger UI - Documentación de API

3. **Contacto:**
   - Email: alannreyesj@gmail.com
   - GitHub Issues: https://github.com/alannreyes/bip2/issues

---

## 🎉 ¡Sistema Funcional!

Una vez completados todos los pasos, tendrás:

- ✅ Sistema de búsqueda semántica funcionando
- ✅ Catálogo sincronizado y actualizado
- ✅ Búsqueda por texto operativa
- ✅ Sincronizaciones automáticas configuradas
- ✅ Monitoreo de salud disponible
- ✅ Interfaz web accesible

**La aplicación está ahora completamente funcional y lista para usar.**
