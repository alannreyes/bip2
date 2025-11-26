# 📋 Instrucciones para el Administrador - BIP2

**Fecha**: 26 de Noviembre 2025
**Servidor de Producción**: 192.168.40.197

---

## 🎯 OBJETIVO

Completar la sincronización del catálogo EFC que actualmente está al **47%** (95,800 de ~202,912 productos).

---

## 📊 ESTADO ACTUAL

| Colección | Puntos Actuales | Total Esperado | Completado |
|-----------|-----------------|----------------|------------|
| catalogo_efc | 95,800 | ~202,912 | ~47% |
| catalogo_stock | 4,586 | ~4,600 | ~99% |

---

## ✅ PASO 1: Actualizar código desde GitHub

```bash
# Conectarse al servidor de producción
ssh usuario@192.168.40.197

# Ir al directorio del proyecto
cd /ruta/al/proyecto/bip2

# Traer últimos cambios
git pull origin main
```

**Commits que se descargarán:**
- `f7004eb` - feat: Mejorar endpoint de validación de duplicados con código EFC y filtro LLM
- `1671ac9` - fix: Resolver problema de sincronización incompleta y mejorar Smart Resume

---

## ✅ PASO 2: Aplicar migración de base de datos

Ejecutar en PostgreSQL (base de datos `qdrant_sync`):

```sql
-- Conectarse a PostgreSQL
psql -U postgres -d qdrant_sync

-- Ejecutar migración
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS lastprogressat TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_last_progress
ON sync_jobs(lastprogressat)
WHERE status = 'running';

COMMENT ON COLUMN sync_jobs.lastprogressat IS 'Timestamp of the last progress update for this job';

-- Actualizar jobs existentes (si hay alguno running)
UPDATE sync_jobs
SET lastprogressat = startedat
WHERE status = 'running'
  AND lastprogressat IS NULL
  AND startedat IS NOT NULL;
```

---

## ✅ PASO 3: Rebuild y reiniciar servicios

```bash
# Opción A: Con Docker Compose
docker-compose down
docker-compose build backend
docker-compose up -d

# Opción B: Con PM2
pm2 restart bip2-backend

# Verificar que está healthy
curl http://localhost:3001/api/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "services": {
    "database": {"healthy": true},
    "qdrant": {"healthy": true},
    "redis": {"healthy": true}
  }
}
```

---

## ✅ PASO 4: Verificar estado de SQL Server

**IMPORTANTE**: El SQL Server "Desarrollo" (192.168.40.251) entra en modo RESTORE diariamente a las 8:30 AM.

```bash
# Probar conexión al datasource
curl -X POST http://localhost:3001/api/datasources/{DATASOURCE_ID}/test
```

**Horarios recomendados para sincronización:**
- ✅ 10:00 PM - 6:00 AM (SQL Server disponible)
- ❌ 8:00 AM - 10:00 AM (posible modo RESTORE)

---

## ✅ PASO 5: Iniciar sincronización

### Opción A: Disparar job manual

```bash
# Obtener ID del datasource catalogo_efc
curl http://localhost:3001/api/datasources

# Iniciar sincronización full
curl -X POST http://localhost:3001/api/sync/start \
  -H "Content-Type: application/json" \
  -d '{
    "datasourceId": "{ID_DEL_DATASOURCE_CATALOGO_EFC}",
    "type": "full"
  }'
```

### Opción B: Esperar al schedule automático (2:00 AM)

El sistema tiene configurado un cron para sincronización automática a las 2:00 AM.

---

## ✅ PASO 6: Monitorear progreso

```bash
# Ver estado del job actual
curl http://localhost:3001/api/sync/jobs?limit=1 | jq '.[0] | {
  status,
  totalRecords,
  processedRecords,
  progress: ((.processedRecords / .totalRecords) * 100 | floor)
}'

# Ver puntos en Qdrant
curl http://localhost:3001/api/collections/catalogo_efc/info | jq '.points_count'
```

**Tiempo estimado para completar ~107,000 productos restantes:**
- Con batchSize=100 y batchDelay=1000ms: ~3-4 horas
- El sistema usa Smart Resume, así que si se interrumpe, continuará desde donde quedó

---

## 🔧 TROUBLESHOOTING

### Si el job se queda en "pending":
```bash
# Reiniciar Redis para limpiar cola
docker-compose restart redis
docker-compose restart backend
```

### Si hay error de conexión a SQL Server:
```bash
# Verificar que no esté en modo RESTORE
# Contactar al DBA para confirmar disponibilidad
```

### Si el job falla por timeout:
```bash
# El Smart Resume debería continuar automáticamente
# Si no, disparar nuevo job - heredará el progreso anterior
```

---

## 📞 CONTACTO

Si hay problemas, el sistema ahora genera logs más detallados:
```bash
docker-compose logs backend --tail=100 | grep -i "sync\|error\|progress"
```

---

## 🆕 NUEVA FUNCIONALIDAD: Validación de Duplicados

Con esta actualización, ahora está disponible el endpoint para evitar duplicados en el maestro:

```bash
# Probar validación de duplicados
curl -X POST http://localhost:3001/api/duplicates/validate-exists \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "catalogo_efc",
    "descripcion": "LLAVE MIXTA 18MM STANLEY",
    "similarityThreshold": 0.85
  }'
```

Colección Postman disponible en: `docs/postman/BIP2_Validar_Duplicados.postman_collection.json`
