# Configuración para Catálogo Real MS SQL - 200K Registros

## Información Requerida

### 1. Conexión MS SQL Server
```
Host: _________________
Port: _________________ (típicamente 1433)
Usuario: _________________
Password: _________________
Base de Datos: _________________
Nombre de Tabla: _________________
```

### 2. Estructura de Campos
Necesito saber qué campos tiene tu tabla. Ejemplo:

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| codigo | varchar | ID del producto | "PROD001" |
| descripcion | nvarchar | Descripción del producto | "Laptop Dell Inspiron 15" |
| marca | varchar | Marca del producto | "Dell" |
| modelo | varchar | Modelo específico | "Inspiron 15 3501" |
| precio | decimal | Precio | 2500.00 |
| categoria | varchar | Categoría | "Computadoras" |
| stock | int | Stock disponible | 50 |
| updated_at | datetime | Fecha de actualización | (¿existe?) |

### 3. Campos Importantes para Búsqueda Semántica

**Campos recomendados para embeddings** (búsqueda):
- ✅ descripcion (principal)
- ✅ marca
- ✅ modelo
- ✅ categoria
- ⚠️ ¿Hay otros campos descriptivos? (ej: subcategoria, aplicacion, especificaciones)

**Campos para payload** (resultados):
- ✅ Todos los campos que quieras ver en los resultados
- 💡 Mientras más contexto, mejor para el usuario

---

## ⚙️ Configuración Recomendada

### Field Mapping Sugerido
```json
{
  "codigo": "id",
  "descripcion": "descripcion",
  "marca": "marca",
  "modelo": "modelo",
  "categoria": "categoria",
  "precio": "precio",
  "stock": "stock",
  "proveedor": "proveedor",
  "subcategoria": "subcategoria"
}
```

### Embedding Fields Sugeridos
```json
[
  "descripcion",    // Campo principal
  "marca",          // Importante para búsquedas como "Dell"
  "modelo",         // Importante para búsquedas específicas
  "categoria"       // Contexto adicional
]
```

**Ejemplo de texto combinado para embedding**:
```
"Laptop Dell Inspiron 15 3501 - Computadoras"
```

### Query Template para MS SQL
```sql
SELECT
  codigo,
  descripcion,
  marca,
  modelo,
  categoria,
  subcategoria,
  precio,
  stock,
  proveedor
FROM productos
WHERE stock > 0
  AND activo = 1
ORDER BY codigo
OFFSET {{offset}} ROWS
FETCH NEXT {{limit}} ROWS ONLY
```

---

## 🚀 Estrategia de Sincronización para 200K

### Primera Sincronización (Full Sync)
- **Registros**: 200,000
- **Batch Size**: 100 (configurable)
- **Batches Totales**: 2,000
- **Rate Limiting**: 1 segundo entre batches
- **Tiempo Estimado**: ~35 minutos
  - 2000 batches × 1s = 2000s = 33.3 min
  - + tiempo de embeddings ≈ 2-3 min adicionales
  - **Total: ~35-40 minutos**

### Sincronizaciones Incrementales (después)
- **Solo cambios**: Productos con `updated_at > lastSyncedAt`
- **Ejemplo**: Si solo 50 productos cambian diariamente
  - 50 productos / 100 per batch = 1 batch
  - Tiempo: ~2-3 segundos
  - **Ahorro**: De 40 minutos a 3 segundos!

---

## ⚠️ Campo `updated_at` en MS SQL

### ¿Existe el campo?
Si NO existe, necesitas agregarlo:

```sql
-- Agregar columna updated_at
ALTER TABLE productos
ADD updated_at DATETIME2 DEFAULT GETDATE();

-- Crear índice para performance
CREATE INDEX idx_updated_at ON productos(updated_at);

-- Inicializar registros existentes
UPDATE productos SET updated_at = GETDATE() WHERE updated_at IS NULL;

-- Crear trigger para auto-update (IMPORTANTE)
CREATE TRIGGER trg_productos_updated_at
ON productos
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE productos
    SET updated_at = GETDATE()
    FROM productos p
    INNER JOIN inserted i ON p.codigo = i.codigo;
END;
```

---

## 📊 Configuración de Datasource (JSON)

```json
{
  "name": "Catálogo Principal MS SQL",
  "type": "mssql",
  "connectionConfig": {
    "host": "TU_HOST",
    "port": 1433,
    "user": "TU_USUARIO",
    "password": "TU_PASSWORD",
    "database": "TU_DATABASE",
    "options": {
      "encrypt": true,
      "trustServerCertificate": true
    }
  },
  "queryTemplate": "SELECT codigo, descripcion, marca, modelo, categoria, precio, stock FROM productos WHERE stock > 0 ORDER BY codigo OFFSET {{offset}} ROWS FETCH NEXT {{limit}} ROWS ONLY",
  "fieldMapping": {
    "codigo": "id",
    "descripcion": "descripcion",
    "marca": "marca",
    "modelo": "modelo",
    "categoria": "categoria",
    "precio": "precio",
    "stock": "stock"
  },
  "idField": "codigo",
  "embeddingFields": [
    "descripcion",
    "marca",
    "modelo",
    "categoria"
  ],
  "qdrantCollection": "catalogo_principal",
  "batchSize": 100,
  "batchDelay": 1000,
  "syncSchedule": "0 2 * * *",
  "description": "Catálogo principal con 200K productos industriales"
}
```

---

## 🎯 Mejores Prácticas para 200K Registros

### 1. Optimización de Batch Size
```javascript
// Para pruebas iniciales
batchSize: 50
batchDelay: 500

// Para producción (recomendado)
batchSize: 100
batchDelay: 1000

// Si tienes muchos cambios diarios
batchSize: 200
batchDelay: 2000
```

### 2. Horario de Sincronización
```
syncSchedule: "0 2 * * *"  // 2 AM diariamente (incremental)
```

### 3. Monitoreo
- Ver logs de sincronización en `/syncs`
- Revisar errores si `failedRecords > 0`
- Validar `lastSyncedAt` se actualiza correctamente

---

## 🔧 Pasos Siguientes

1. **Proporciona la información de tu MS SQL**:
   - Host, puerto, credenciales
   - Nombre de tabla
   - Estructura de campos

2. **Verifica campo `updated_at`**:
   - ¿Existe en tu tabla?
   - ¿Tiene trigger de auto-update?

3. **Defíneme los campos**:
   - ¿Qué campos quieres en la búsqueda?
   - ¿Qué campos quieres mostrar en resultados?

4. **Crearé el datasource** con la configuración óptima

5. **Primera sincronización**:
   - Ejecutaremos Full Sync (40 min aprox)
   - Validaremos resultados

6. **Sincronizaciones subsecuentes**:
   - Automáticas con cron
   - O manuales con "Sync Inc" (3 segundos!)

---

## 💡 Preguntas Clave

Por favor responde:

1. **¿Cuál es el nombre de tu tabla en MS SQL?**
2. **¿Qué campos tiene la tabla?** (lista completa)
3. **¿Existe el campo `updated_at` o similar?**
4. **¿Qué campos quieres que se busquen?** (descripcion, marca, modelo, ¿otros?)
5. **¿Hay campos adicionales importantes?** (proveedor, subcategoria, aplicacion, etc.)
6. **¿Los productos tienen algún campo de estado?** (activo, disponible, etc.)

Con esta información, te ayudaré a configurar el datasource perfecto para tus 200K registros! 🚀
