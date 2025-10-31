# Ejemplo: Configurar Datasource MySQL Canasta Básica

## 📋 Pasos para Configurar en el Sistema

### 1. Acceder a la Interfaz Web

Abre tu navegador en: **http://localhost:3002**

### 2. Crear Nueva Fuente de Datos

1. Ve a **"Fuentes de Datos"** en el menú
2. Click en **"Crear Primera Fuente de Datos"** o **"Nueva Fuente de Datos"**

### 3. Configuración Básica

**Información General:**
```
Nombre: Catálogo Canasta Básica EFC
Descripción: Productos de canasta familiar para supermercado
Tipo de Base de Datos: MySQL
```

### 4. Configuración de Conexión

**Connection Config (JSON):**
```json
{
  "host": "localhost",
  "port": 3307,
  "user": "efc",
  "password": "efc123",
  "database": "canasta_basica"
}
```

### 5. Query Template

**SQL Query:**
```sql
SELECT
  codigo,
  CONCAT(descripcion, ' - ', categoria, ' - ', proveedor, ' - S/', FORMAT(precio, 2)) as texto_completo,
  descripcion,
  precio,
  proveedor,
  categoria,
  stock,
  contacto
FROM articulos
WHERE stock > 0
ORDER BY codigo
LIMIT {limit} OFFSET {offset}
```

**Notas:**
- `{limit}` y `{offset}` son placeholders que el sistema reemplazará automáticamente
- El campo `texto_completo` combina toda la información relevante para búsqueda semántica

### 6. Field Mapping

**Mapeo de Campos (JSON):**
```json
{
  "id": "codigo",
  "content": "texto_completo",
  "metadata": {
    "descripcion": "descripcion",
    "precio": "precio",
    "proveedor": "proveedor",
    "categoria": "categoria",
    "stock": "stock",
    "contacto": "contacto"
  }
}
```

**Explicación:**
- `id`: Campo único que identifica cada producto (código del artículo)
- `content`: Campo principal que se usará para generar embeddings
- `metadata`: Información adicional que se guardará con cada vector

### 7. Embedding Fields

**Campos para Embeddings:**
```json
["descripcion", "categoria", "proveedor"]
```

**Estos campos se combinarán para generar el embedding vectorial con Gemini AI**

### 8. Colección en Qdrant

**Nombre de Colección:**
```
canasta_basica_productos
```

### 9. Configuración de Sincronización (Opcional)

**Programar sincronización automática:**

Formato Cron para sincronizar todos los días a las 2 AM:
```
0 2 * * *
```

Otros ejemplos:
- Cada hora: `0 * * * *`
- Cada 6 horas: `0 */6 * * *`
- Lunes a Viernes a las 8 AM: `0 8 * * 1-5`

### 10. Webhook (Opcional)

Si quieres sincronización en tiempo real:
- ✅ Habilitar Webhook
- Se generará un `webhook_secret` automáticamente
- URL del webhook: `http://localhost:3001/api/webhooks/sync/{datasource_id}`

## 🧪 Probar la Conexión

Antes de guardar, usa el botón **"Probar Conexión"** para verificar que:
- ✅ La conexión a MySQL es exitosa
- ✅ La query devuelve resultados
- ✅ Los campos mapeados son correctos

## ▶️ Ejecutar Primera Sincronización

### Sincronización Completa (Full Sync)

1. Guarda la configuración del datasource
2. Ve a **"Sincronizaciones"**
3. Click en **"Nueva Sincronización"**
4. Selecciona tipo: **"Full Sync"**
5. Selecciona el datasource: **"Catálogo Canasta Básica EFC"**
6. Click en **"Iniciar Sincronización"**

**Proceso que ocurrirá:**
1. Se leerán los 100 artículos de la base de datos
2. Por cada artículo se generará un embedding de 3072 dimensiones usando Gemini AI
3. Los vectores se insertarán en Qdrant
4. Podrás ver el progreso en tiempo real

**Tiempo estimado:** ~2-3 minutos para 100 artículos

## 🔍 Realizar Búsquedas Semánticas

Una vez completada la sincronización, ve a **"Búsqueda"**:

### Ejemplos de Búsquedas por Texto:

**Buscar arroz:**
```
arroz para preparar comida peruana
```

**Buscar productos de limpieza:**
```
necesito productos para limpiar mi casa
```

**Buscar desayuno:**
```
productos para un desayuno nutritivo
```

**Buscar ingredientes para cocinar:**
```
ingredientes básicos para cocinar pasta
```

El sistema buscará productos semánticamente relacionados, no solo coincidencias exactas.

## 📊 Vista Previa de Datos

Para ver cómo se verán los datos antes de sincronizar:

1. En la página de edición del datasource
2. Click en **"Vista Previa de Datos"**
3. Verás los primeros 5 registros con el formato que se enviará a Qdrant

**Ejemplo de resultado:**
```json
{
  "id": "ARR001",
  "content": "Arroz Blanco Superior Costeño 1kg - Arroz - Costeño SAC - S/4.50",
  "metadata": {
    "descripcion": "Arroz Blanco Superior Costeño 1kg",
    "precio": 4.50,
    "proveedor": "Costeño SAC",
    "categoria": "Arroz",
    "stock": 500,
    "contacto": "ventas@costeno.com.pe"
  }
}
```

## 🔄 Sincronización Incremental

Para actualizaciones posteriores:

1. Modifica algunos productos en MySQL:
```sql
UPDATE articulos SET precio = 5.00 WHERE codigo = 'ARR001';
UPDATE articulos SET stock = 450 WHERE codigo = 'ARR002';
```

2. Ejecuta una **"Sincronización Incremental"**
3. Solo se procesarán los registros modificados desde la última sincronización

## 📈 Monitoreo

En el **Dashboard** podrás ver:
- Total de datasources activos
- Colecciones creadas
- Puntos vectoriales totales (100 en este caso)
- Historial de sincronizaciones
- Estado de los jobs

## ⚙️ Configuración Avanzada

### Query para Sincronización Incremental

Si configuraste `lastSyncedAt` en el datasource:

```sql
SELECT
  codigo,
  CONCAT(descripcion, ' - ', categoria, ' - ', proveedor, ' - S/', FORMAT(precio, 2)) as texto_completo,
  descripcion,
  precio,
  proveedor,
  categoria,
  stock,
  contacto
FROM articulos
WHERE fecha_actualizacion > '{lastSyncedAt}'
ORDER BY codigo
LIMIT {limit} OFFSET {offset}
```

## 🎯 Resultado Esperado

Al finalizar tendrás:

✅ 100 productos indexados en Qdrant
✅ Búsqueda semántica funcionando
✅ Embeddings de 3072 dimensiones con Gemini AI
✅ Metadata completa de cada producto
✅ Sistema listo para búsquedas en lenguaje natural

## 🐛 Troubleshooting

### Error de Conexión
- Verifica que el contenedor MySQL esté corriendo: `docker ps | grep mysql`
- Verifica el puerto: `3307`
- Verifica credenciales: usuario `efc`, password `efc123`

### Query Inválido
- Asegúrate de usar `{limit}` y `{offset}` en el query
- Verifica que los nombres de campos sean correctos

### Sin Resultados
- Verifica que la tabla tenga datos: `SELECT COUNT(*) FROM articulos`
- Verifica que el filtro `stock > 0` no esté excluyendo todos los registros

### Errores de Gemini AI
- Verifica que el API Key esté configurado en `.env`
- Verifica que tengas cuota disponible en tu cuenta de Google AI Studio
