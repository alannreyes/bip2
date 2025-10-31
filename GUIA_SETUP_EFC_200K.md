# 🚀 Guía de Setup - Catálogo EFC 200K Registros

## Resumen del Query Optimizado

He creado un query balanceado para tu catálogo de 200K productos:

### 📊 Campos Seleccionados (17 total)

**🔍 Para Embeddings (10 campos - texto rico para búsqueda semántica):**
1. `Articulo_Descripcion` - Descripción principal del producto
2. `Marca_Descripcion` - Marca (excluye marca genérica GUID)
3. `Categoria_Descripcion` - Categoría (limpia prefijos numéricos)
4. `Sub_Familia_Descripcion` - Subcategoría (limpia prefijos)
5. `Familia_Descripcion` - Familia de productos (limpia prefijos)
6. `Linea_Descripcion` - Línea de negocio
7. `Articulo_Numero_Parte` - Part number técnico (limpia vacíos)
8. `Articulo_Codigo_Fabricante` - Código fabricante (excluye "SIN CODIGO", "S/N")
9. `Articulo_Uso` - Aplicación/uso del producto
10. `Unidad_Medida_Descripcion` - Unidad de medida (contexto adicional)

**📦 Para Payload (7 campos - información complementaria):**
1. `Articulo_Codigo` - ID único del producto
2. `Articulo_De_Stock` - ¿Es producto de stock?
3. `Articulo_Lista_Costo` - Precio de lista
4. `Cantidad_Ventas_Ultimos_3_Anios` - Popularidad (para ranking)
5. `Fecha_Ultima_Venta` - Última venta registrada
6. `Articulo_Fecha_Modificacion` - **CRÍTICO** para sync incremental

---

## ⚠️ Verificación Previa IMPORTANTE

### 1. Campo `Articulo_Fecha_Modificacion`

El query asume que existe este campo:
```sql
Articulo_Fecha_Modificacion = ISNULL(A.Articulo_Fecha_Modificacion, A.Articulo_Fecha_Creacion)
```

**Verifica si existe en tu `Vista_Articulos`:**
```sql
SELECT TOP 1
    Articulo_Codigo,
    Articulo_Fecha_Modificacion,
    Articulo_Fecha_Creacion
FROM Vista_Articulos
```

**Si NO existe `Articulo_Fecha_Modificacion`:**

Opción A - Usar solo `Articulo_Fecha_Creacion` (menos óptimo):
```sql
-- En el query, cambiar línea 94 a:
Articulo_Fecha_Modificacion = A.Articulo_Fecha_Creacion
```

Opción B - Agregar el campo (RECOMENDADO para sync incremental):
```sql
-- Contacta a tu DBA para agregar el campo a la tabla base
-- Y actualizar la Vista_Articulos para incluirlo
```

---

## 📝 Pasos de Setup

### Paso 1: Test de Conexión Manual

Primero, verifica que puedas conectarte a la base de datos:

```bash
# Desde tu máquina o servidor con acceso al servidor SQL
sqlcmd -S TU_SQL_SERVER -U TU_USUARIO -P "TU_PASSWORD" -d EFC_DB_PROD -Q "SELECT TOP 5 Articulo_Codigo FROM Vista_Articulos"
```

### Paso 2: Crear el Datasource vía API

```bash
curl -X POST http://localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d @/opt/proyectos/bip2/DATASOURCE_CONFIG_EFC_200K.json
```

**Respuesta esperada:**
```json
{
  "id": "uuid-generado-aqui",
  "name": "Catálogo Principal EFC - 200K Productos",
  "type": "mssql",
  "status": "active",
  "createdAt": "2025-10-15T...",
  ...
}
```

**Guarda el ID del datasource** para los siguientes pasos.

### Paso 3: Test de Conexión

```bash
curl -X POST http://localhost:3001/api/datasources/<DATASOURCE_ID>/test
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Connection successful"
}
```

### Paso 4: Preview de Datos

```bash
curl http://localhost:3001/api/datasources/<DATASOURCE_ID>/preview?limit=5
```

**Verifica que los datos se vean correctos:**
- Todos los 17 campos deben aparecer
- `Articulo_Descripcion` debe tener texto descriptivo
- `Marca_Descripcion` no debe tener GUIDs extraños
- `Categoria_Descripcion`, `Familia_Descripcion`, `Sub_Familia_Descripcion` no deben tener prefijos numéricos (ej: "01-")
- `Articulo_Fecha_Modificacion` debe tener un valor (fecha)

---

## 🎯 Sincronización

### Primera Sincronización (Full Sync)

**⏱️ Tiempo estimado para 200K registros:**
- Batches: 200,000 / 100 = 2,000 batches
- Rate limiting: 1 segundo entre batches = 2,000 segundos = ~33 minutos
- Embeddings (Gemini): ~5-7 minutos adicionales
- **Total: ~40 minutos**

```bash
# Ejecutar Full Sync
curl -X POST http://localhost:3001/api/sync/full/<DATASOURCE_ID>
```

**Respuesta:**
```json
{
  "message": "Full synchronization started",
  "jobId": "job-uuid-aqui"
}
```

**Monitorear el job:**
```bash
# Ver estado del job
curl http://localhost:3001/api/sync/jobs/<JOB_ID>

# Refrescar cada 30 segundos para ver progreso
watch -n 30 "curl -s http://localhost:3001/api/sync/jobs/<JOB_ID> | jq '.'"
```

**Progreso esperado:**
```json
{
  "id": "job-uuid",
  "status": "running",  // pending → running → completed
  "progress": 45,       // % completado
  "totalRecords": 200000,
  "processedRecords": 90000,
  "successfulRecords": 89950,
  "failedRecords": 50,
  "startedAt": "2025-10-15T...",
  "estimatedTimeRemaining": "15 minutes"
}
```

### Sincronizaciones Incrementales (Subsecuentes)

**⚡ Tiempo estimado (asumiendo 50 productos modificados diariamente):**
- Registros: 50 / 100 per batch = 1 batch
- Rate limiting: 1 segundo
- Embeddings: <1 segundo
- **Total: ~3 segundos**

**Ahorro: De 40 minutos a 3 segundos = 99.875% menos tiempo y costos!**

```bash
# Ejecutar Incremental Sync
curl -X POST http://localhost:3001/api/sync/incremental/<DATASOURCE_ID>
```

---

## 📊 Validación de Resultados

### 1. Verificar Colección en Qdrant

```bash
curl http://localhost:3001/api/collections/catalogo_efc_200k
```

**Esperado:**
```json
{
  "name": "catalogo_efc_200k",
  "vectorSize": 3072,
  "pointsCount": 200000,  // ~200K después del full sync
  "distance": "Cosine",
  "status": "green"
}
```

### 2. Prueba de Búsqueda Semántica

```bash
# Ejemplo: Buscar "bomba centrífuga 5HP"
curl -X POST http://localhost:3001/api/search/text \
  -H "Content-Type: application/json" \
  -d '{
    "query": "bomba centrífuga 5HP para agua industrial",
    "collection": "catalogo_efc_200k",
    "limit": 5
  }'
```

**Resultado esperado:**
```json
{
  "results": [
    {
      "id": "BOMBA-001",
      "score": 0.85,
      "payload": {
        "descripcion": "Bomba Centrífuga Industrial 5HP",
        "marca": "Pedrollo",
        "categoria": "Bombas",
        "familia": "Equipos de Bombeo",
        "precio_lista": 2500.00,
        "en_stock": true,
        ...
      }
    },
    ...
  ],
  "total": 5,
  "duration": "1.2s"
}
```

### 3. Historial de Syncs

```bash
curl http://localhost:3001/api/syncs?datasourceId=<DATASOURCE_ID>&limit=10
```

---

## ⚙️ Configuración Recomendada

### Batch Size y Delay

**Configuración actual:**
- `batchSize: 100` - Registros por lote
- `batchDelay: 1000` - 1 segundo entre lotes

**Ajustes según necesidad:**

#### Para Primera Sync (Velocidad)
Si quieres acelerar la primera sincronización:
```json
{
  "batchSize": 200,
  "batchDelay": 500
}
```
- Tiempo: ~18 minutos (vs 40 minutos)
- ⚠️ Mayor carga en Gemini API y Qdrant

#### Para Producción (Estabilidad)
Configuración recomendada (actual):
```json
{
  "batchSize": 100,
  "batchDelay": 1000
}
```
- Tiempo: ~40 minutos para full sync
- ✅ Estable, respeta rate limits

#### Para Sync Incremental (Rapidez)
Los incrementales son tan rápidos que no necesitas ajustar:
```json
{
  "batchSize": 100,
  "batchDelay": 500  // Puedes reducir a 500ms
}
```
- Tiempo: ~2 segundos para 50 productos

### Cron Schedule

**Configuración actual:**
```
syncSchedule: "0 2 * * *"  // 2 AM diariamente
```

**Otras opciones:**
```
"0 */6 * * *"   // Cada 6 horas
"0 0 * * 0"     // Cada domingo a medianoche
"0 1 * * 1-5"   // Lunes a viernes 1 AM
```

---

## 🔧 Troubleshooting

### Error: Connection Timeout

**Problema**: No puede conectarse al servidor SQL

**Soluciones:**
1. Verifica firewall permite puerto 1433
2. Verifica que el servidor backend tenga acceso a la red de MS SQL
3. Prueba conexión manual con `sqlcmd` o `telnet TU_SQL_SERVER 1433`

### Error: Invalid Object Name 'Vista_Articulos'

**Problema**: La vista no existe o no tienes permisos

**Soluciones:**
1. Verifica el nombre exacto de la vista
2. Confirma que el usuario BIP tiene permisos SELECT
3. Verifica que estás usando la base de datos correcta (EFC_DB_PROD)

### Error: Campo 'Articulo_Fecha_Modificacion' no encontrado

**Problema**: El campo no existe en la vista

**Solución:**
Edita el datasource y cambia la línea del query:
```sql
-- Cambiar de:
Articulo_Fecha_Modificacion = ISNULL(A.Articulo_Fecha_Modificacion, A.Articulo_Fecha_Creacion)

-- A:
Articulo_Fecha_Modificacion = A.Articulo_Fecha_Creacion
```

⚠️ **Nota**: Sin `Articulo_Fecha_Modificacion` real, el sync incremental sincronizará TODOS los registros cada vez.

### Error: Rate Limit Exceeded (Gemini API)

**Problema**: Demasiadas peticiones a Gemini

**Solución:**
Aumenta `batchDelay`:
```json
{
  "batchSize": 50,
  "batchDelay": 2000  // 2 segundos
}
```

---

## 📈 Métricas Esperadas

### Después del Full Sync

| Métrica | Valor Esperado |
|---------|----------------|
| Registros en Qdrant | ~200,000 |
| Dimensiones del vector | 3072 (Gemini) |
| Distancia métrica | Cosine |
| Tiempo de búsqueda | 1-2 segundos |
| Relevancia (búsquedas exactas) | >75% |
| Costo primera sync | ~$X (según pricing Gemini) |

### Después de Incremental Syncs

| Métrica | Valor Típico |
|---------|--------------|
| Registros sincronizados | 10-100 (solo cambios) |
| Tiempo de sync | 2-5 segundos |
| Frecuencia | Diaria (2 AM) |
| Ahorro vs Full Sync | >99% |

---

## ✅ Checklist de Validación

Después del setup, verifica:

- [ ] Datasource creado exitosamente
- [ ] Test de conexión PASSED
- [ ] Preview muestra 17 campos correctamente
- [ ] Campo `Articulo_Fecha_Modificacion` tiene valores
- [ ] Full Sync completado sin errores
- [ ] Colección Qdrant tiene ~200K puntos
- [ ] Búsqueda por texto retorna resultados relevantes
- [ ] Búsqueda por imagen funciona (frontend)
- [ ] Sync incremental solo procesa registros modificados
- [ ] Cron job configurado para sync automático

---

## 🎯 Próximos Pasos

1. **Ejecuta el setup** siguiendo los pasos arriba
2. **Valida la primera sincronización** (40 min)
3. **Prueba búsquedas** desde frontend (http://localhost:3002/search)
4. **Simula cambios** en productos y ejecuta sync incremental
5. **Monitorea** el dashboard para ver métricas

---

## 💡 Notas Importantes

1. **Backup**: Considera hacer backup de la configuración del datasource después de validar
2. **Monitoreo**: Revisa logs de sync en `/syncs` regularmente
3. **Alertas**: Si `failedRecords > 0`, investiga el error en logs
4. **Costos**: Cada embedding cuesta dinero - el sync incremental ahorra significativamente
5. **Performance**: Si las búsquedas son lentas, considera usar filtros adicionales

---

**¿Listo para empezar?**

Ejecuta el Paso 2 para crear el datasource! 🚀
