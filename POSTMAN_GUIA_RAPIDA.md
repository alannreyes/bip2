# 📚 Guía Rápida - Postman Collection (Sin Variables)

## ✅ Lo que necesitas saber

**Archivo:** `postman_bip2_ejemplos_directos.json`
- Contiene **50+ ejemplos** listos para copiar
- **Sin variables** - todos los valores están directos
- Copiar → Adaptar → Usar
- Base URL: `http://192.168.40.197:3001/api`

---

## 🗂️ Estructura de Carpetas

### 1. 📊 BÚSQUEDA BÁSICA - Catálogo EFC
Búsquedas simples sin filtros
- Desarmador
- Martillo
- Llave inglesa

**Uso:** Copia cualquiera y cambia el "query"

---

### 2. 🔍 CON FILTRO MARCA
Busca un producto de una marca específica
- Lentes HONEYWELL
- Pegamento LOCTITE
- Bolígrafos PILOT

**Parámetro:** `"marca": "HONEYWELL"`

**Clientes reales:**
- `000106` → HONEYWELL
- `003592` → LOCTITE
- `004401` → PILOT

---

### 3. 👥 CON FILTRO CLIENTE
Busca qué ha comprado un cliente específico
- Cliente 000106 (HONEYWELL)
- Cliente 003592 (LOCTITE)
- Cliente 004401 (PILOT)

**Parámetro:** `"cliente": "000106"`

---

### 4. 🎯 FILTROS DE PAYLOAD (Ventas, Stock, etc)
**Los más útiles para tu pregunta:**

| # | Ejemplo | Qué hace | Parámetro |
|---|---------|----------|-----------|
| 1️⃣ | Productos con ventas >= 1 | Excluye productos sin ventas | `"ventas_3_anios": { "gte": 1 }` |
| 2️⃣ | MUY POPULARES (>= 50) | Solo los top sellers | `"ventas_3_anios": { "gte": 50 }` |
| 3️⃣ | Solo EN STOCK | Solo disponibles | `"en_stock": true` |
| 4️⃣ | MODERADAMENTE POPULARES (5-50) | Rango intermedio | `"ventas_3_anios": { "gte": 5, "lte": 50 }` |
| 5️⃣ | En stock Y >= 10 ventas | Combinación de dos filtros | Ambos parámetros |
| 6️⃣ | Con lista de precios | Tienen precio activo | `"precio_lista": true` |

**TU RESPUESTA:** Para "Cantidad_Ventas_Ultimos_3_Anios > 1"

```json
{
  "query": "tu búsqueda aquí",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "payloadFilters": {
    "ventas_3_anios": { "gt": 1 }
  }
}
```

Operadores disponibles:
- `"gte": N` → Mayor o igual (≥)
- `"gt": N` → Mayor que (>)
- `"lte": N` → Menor o igual (≤)
- `"lt": N` → Menor que (<)

---

### 5. 🎭 COMBINADOS: Marca + Payload Filters
Usa marca Y filtro de payload juntos
- HONEYWELL + con ventas >= 1
- LOCTITE + en stock + populares
- PILOT + con precio lista

**Parámetros combinados:**
```json
{
  "query": "pegamento",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "marca": "LOCTITE",
  "payloadFilters": {
    "en_stock": true,
    "ventas_3_anios": { "gte": 5 }
  }
}
```

---

### 6. 👥🎯 COMBINADOS: Cliente + Payload Filters
Busca para un cliente CON filtros de payload
- Cliente 000106 + en stock
- Cliente 003592 + muy populares
- Cliente 004401 + con lista de precios

**Parámetros combinados:**
```json
{
  "query": "lentes",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "cliente": "000106",
  "payloadFilters": {
    "en_stock": true
  }
}
```

---

### 7. ⚙️ BÚSQUEDA MULTI-COLECCIÓN
Busca en 2 catálogos a la vez
- EFC + Stock (sin filtros)
- EFC + Stock (en stock solamente)

**Parámetro:**
```json
{
  "collections": ["catalogo_efc_200k", "catalogo_stock"]
}
```

---

### 8. 🤖 CON LLM FILTER
Usa IA para refinar resultados (más lento)
- Búsqueda básica con LLM
- LLM + payload filters

**Parámetro:** `"useLLMFilter": true`

**Nota:** Activa análisis semántico con Gemini, tarda más pero es más preciso

---

### 9. 🔍 VER TODOS LOS PAYLOADS DE UN PRODUCTO ⭐ NUEVO
**Obtener TODOS los campos de un producto por ID** - Esto responde tu pregunta
- Obtener payloads de un producto EFC
- Obtener payloads de un producto Stock

**Endpoint:** `GET /api/search/product/:collection/:productId`

**Ejemplo:**
```bash
GET http://192.168.40.197:3001/api/search/product/catalogo_efc_200k/ALM_FT10
```

**Respuesta:**
```json
{
  "collection": "catalogo_efc_200k",
  "productId": "ALM_FT10",
  "id": "ALM_FT10",
  "payload": {
    "descripcion": "Destornillador...",
    "marca": "STANLEY",
    "ventas_3_anios": 25,
    "en_stock": true,
    "precio_lista": true,
    "fecha_ultima_venta": "2025-11-10",
    ...todos los demás campos
  },
  "payload_fields": [
    "descripcion",
    "marca",
    "ventas_3_anios",
    "en_stock",
    "precio_lista",
    "fecha_ultima_venta",
    ...otros campos
  ]
}
```

**Para qué sirve:**
- Ver EXACTAMENTE qué campos/payloads tiene un producto
- Descubrir qué payloads puedes filtrar
- Entender la estructura de datos completa
- Debugging de resultados de búsqueda

---

### 10. 📈 STATUS Y JOBS
Ver estado del sistema
- Health Check (¿está online?)
- Listar Datasources (¿qué catálogos hay?)
- Ver todos los Sync Jobs (¿cuánto falta?)
- Ver Job específico (progreso de una sincronización)

---

## 🔥 Ejemplos Más Comunes

### Caso 1: "Dame los mejores desarmadores en stock"
```json
{
  "query": "desarmador",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "payloadFilters": {
    "en_stock": true,
    "ventas_3_anios": { "gte": 5 }
  }
}
```

### Caso 2: "¿Qué ha comprado HONEYWELL?"
```json
{
  "query": "lentes de seguridad",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "cliente": "000106"
}
```

### Caso 3: "Pegamentos LOCTITE que se venden (>1 venta)"
```json
{
  "query": "pegamento adhesivo",
  "collections": ["catalogo_efc_200k"],
  "limit": 10,
  "marca": "LOCTITE",
  "payloadFilters": {
    "ventas_3_anios": { "gt": 1 }
  }
}
```

### Caso 4: "Herramientas populares (50+ ventas) en stock"
```json
{
  "query": "martillo cincel destornillador",
  "collections": ["catalogo_efc_200k"],
  "limit": 15,
  "payloadFilters": {
    "ventas_3_anios": { "gte": 50 },
    "en_stock": true
  }
}
```

---

## 📝 Campos de Payload Disponibles

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `ventas_3_anios` | Número | Ventas últimos 3 años | `{ "gte": 1 }` |
| `en_stock` | Boolean | Disponible | `true` |
| `precio_lista` | Boolean | Tiene precio activo | `true` |
| `fecha_ultima_venta` | Date | Última vez que se vendió | (avanzado) |

**Alias (también funcionan):**
- `Cantidad_Ventas_Ultimos_3_Anios` = `ventas_3_anios`
- `stock` = `en_stock`
- `ultima_venta` = `fecha_ultima_venta`

---

## 🚀 Cómo Usar

1. **Abre Postman** → Import → Select File
2. **Elige:** `postman_bip2_ejemplos_directos.json`
3. **Selecciona un ejemplo** → Click
4. **Cambia lo que necesites** (query, marca, cliente, límite)
5. **Send**

¡Eso es! No hay variables que configurar.

---

## 📊 Estado del Sitema (últimos endpoints)

Para ver el progreso de las sincronizaciones:

```bash
curl http://192.168.40.197:3001/api/sync/jobs | jq '.'
```

O en Postman: usa el endpoint "Ver todos los Sync Jobs"

---

## 💡 Pro Tips

- **Copia completa el JSON del body**, no solo partes
- **Cambia `query`** según lo que busques
- **Agrega `payloadFilters`** solo si los necesitas
- **Usa `limit`** para controlar cuántos resultados (max 100)
- **Combina filtros:** marca + payload = muy poderoso
- **Cliente + payloadFilters** = filtro más específico

---

## 🔗 Endpoints Principales

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/search/text` | POST | Buscar productos |
| `/api/health` | GET | Ver estado del sistema |
| `/api/datasources` | GET | Listar catálogos disponibles |
| `/api/sync/jobs` | GET | Ver todas las sincronizaciones |
| `/api/sync/jobs/{id}` | GET | Ver progreso de una sincronización |

---

---

## 🎯 Cómo Descubrir Payloads Disponibles (NUEVO)

Si no sabes qué campos puedes filtrar, usa este endpoint:

```bash
GET http://192.168.40.197:3001/api/search/product/catalogo_efc_200k/ALM_FT10
```

La respuesta te mostrará `payload_fields` con TODOS los campos disponibles:
```
payload_fields: [
  "descripcion",
  "marca",
  "ventas_3_anios",
  "en_stock",
  "precio_lista",
  "fecha_ultima_venta",
  "categoria",
  "numero_parte",
  ... y más
]
```

Luego puedes usar cualquier campo en `payloadFilters`:
```json
{
  "query": "herramienta",
  "collections": ["catalogo_efc_200k"],
  "payloadFilters": {
    "numero_parte": "TOOL-2024",
    "categoria": "Herramientas"
  }
}
```

---

**Versión:** 4.1.0
**Última actualización:** Noviembre 2025
**Sin variables:** ✅ Todos los valores directos en cada request
**Nuevo:** 🆕 Endpoint para ver todos los payloads de un producto
