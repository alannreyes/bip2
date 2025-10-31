# 🚀 Guía Rápida: Conectar MySQL Canasta Básica

## ⚠️ IMPORTANTE: Configuración Correcta

### ❌ INCORRECTO - NO uses URL completa:
```
❌ http://localhost:3307
❌ mysql://localhost:3307
❌ localhost:3307/canasta_basica
```

### ✅ CORRECTO - Usa JSON simple:

## 📝 Paso a Paso en la Interfaz Web

### 1. Ir a Crear Datasource

Abre: **http://localhost:3002/datasources/new**

### 2. Información Básica

```
Nombre: Canasta Básica EFC
Descripción: Productos de supermercado
Tipo: MySQL
```

### 3. Connection Config (JSON)

**Copia y pega EXACTAMENTE esto:**

```json
{
  "host": "localhost",
  "port": 3307,
  "user": "efc",
  "password": "efc123",
  "database": "canasta_basica"
}
```

### 4. Query Template

**Copia y pega esto:**

```sql
SELECT
  codigo,
  CONCAT(descripcion, ' - ', categoria, ' - ', proveedor, ' - S/', FORMAT(precio, 2)) as texto_completo,
  descripcion,
  precio,
  proveedor,
  categoria,
  stock
FROM articulos
WHERE stock > 0
ORDER BY codigo
LIMIT {{limit}} OFFSET {{offset}}
```

**⚠️ IMPORTANTE:** El query usa `{{limit}}` y `{{offset}}` (dobles llaves `{{}}`)

### 5. Field Mapping

**Copia y pega esto:**

```json
{
  "id": "codigo",
  "content": "texto_completo",
  "metadata": {
    "descripcion": "descripcion",
    "precio": "precio",
    "proveedor": "proveedor",
    "categoria": "categoria",
    "stock": "stock"
  }
}
```

### 6. Embedding Fields

**Copia y pega esto:**

```json
["descripcion", "categoria", "proveedor"]
```

### 7. Qdrant Collection Name

```
canasta_basica_productos
```

### 8. Probar Conexión

Click en el botón **"Test Connection"** o **"Probar Conexión"**

✅ Deberías ver: "Connection successful - MySQL 8.0.43"

### 9. Vista Previa (Opcional)

Click en **"Preview Data"** para ver los primeros registros

### 10. Guardar

Click en **"Save"** o **"Guardar"**

## 🧪 Verificar la Conexión Manualmente

Si tienes problemas, verifica desde la terminal:

```bash
# Verificar que el contenedor está corriendo
docker ps | grep mysql

# Probar conexión
docker exec efc-canasta-mysql mysql -uefc -pefc123 -e "USE canasta_basica; SELECT COUNT(*) FROM articulos;"
```

Deberías ver: `100`

## 🐛 Troubleshooting

### Error: "Cannot connect to MySQL"

**Posible causa:** El campo "host" está mal configurado

**Solución:**
```json
{
  "host": "localhost",     ✅ CORRECTO
  "host": "127.0.0.1",     ✅ TAMBIÉN FUNCIONA
  "host": "http://localhost",  ❌ INCORRECTO
}
```

### Error: "Access denied for user"

**Posible causa:** Usuario o contraseña incorrecta

**Solución:**
Verifica que usas:
- Usuario: `efc` (minúsculas)
- Contraseña: `efc123`

### Error: "Unknown database"

**Posible causa:** Nombre de base de datos mal escrito

**Solución:**
Debe ser exactamente: `canasta_basica` (con guion bajo, no espacio)

### Error: "ECONNREFUSED"

**Posible causa:** Puerto incorrecto o contenedor no está corriendo

**Solución:**
1. Verifica el puerto: debe ser `3307` (número, no string)
2. Verifica que el contenedor está corriendo:
```bash
docker ps | grep efc-canasta-mysql
```

Si no está corriendo:
```bash
cd /opt/proyectos/bip2/backend
docker-compose up -d mysql
```

### Error en el Query

**Posible causa:** Usar `{limit}` en lugar de `{{limit}}`

**Solución:**
El sistema usa **dobles llaves**: `{{limit}}` y `{{offset}}`

## 📊 Resultado Esperado

Después de configurar correctamente, deberías poder:

1. ✅ Conectar exitosamente
2. ✅ Ver vista previa de 5 productos
3. ✅ Guardar el datasource
4. ✅ Ejecutar una sincronización completa
5. ✅ Ver 100 productos indexados en Qdrant

## 🎯 Siguiente Paso

Una vez guardado el datasource, ve a:

**http://localhost:3002/syncs**

Y ejecuta una **Full Sync** para indexar los 100 productos.

## 📞 Ayuda Rápida

Si ves errores en la interfaz, mira los logs del backend:

```bash
# Ver logs en tiempo real
tail -f /opt/proyectos/bip2/backend/logs/*.log

# O si usas Docker
docker logs -f backend-container-name
```

O revisa la consola del navegador (F12) para ver errores del frontend.
