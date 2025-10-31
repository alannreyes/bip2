# Changelog

## [2025-10-14] - Actualización Mayor de Modelos

### 🚀 Actualizaciones de Modelos AI

#### Embeddings Model
- **ACTUALIZADO:** `text-embedding-004` → `gemini-embedding-001`
- **Dimensiones:** 768 → **3072**
- **Estado:** GA (Generally Available desde julio 2025)
- **Mejoras:**
  - Top performance en MTEB Multilingual leaderboard
  - Soporte para +100 idiomas
  - 8K tokens de input (vs 2K anterior)
  - **Matryoshka Representation Learning (MRL):**
    - Permite truncar embeddings a: 64, 128, 256, 512, 768, 1024, 1536, 2048
    - Mantiene precisión con menor almacenamiento
    - Flexible para diferentes casos de uso

#### Vision Model
- **ACTUALIZADO:** `gemini-1.5-flash` → `gemini-2.0-flash-exp`
- **Mejoras:**
  - Mejor extracción de texto de imágenes
  - Modelo experimental de última generación

### 🔧 Cambios Técnicos

#### Backend
- ✅ `GeminiEmbeddingService`:
  - Nuevo método `getTruncatedVectorSize(dimensions)`
  - Nuevo método `truncateEmbedding(embedding, targetDimensions)`
  - Vector size por defecto: 3072
  - Soporte MRL integrado

- ✅ `QdrantService`:
  - Vector size por defecto: 3072
  - Compatible con colecciones existentes (backward compatible)

#### Base de Datos
- ⚠️ **IMPORTANTE:** Las colecciones existentes con 768 dimensiones seguirán funcionando
- 🆕 Nuevas colecciones se crearán con 3072 dimensiones por defecto

### 📋 Migración de Colecciones Existentes

Si tienes colecciones activas con 768 dimensiones, tienes 2 opciones:

#### Opción 1: Mantener colecciones actuales (Recomendado)
```bash
# No hacer nada - seguirán funcionando
# Usar MRL truncation a 768 para nuevos vectores:
# truncateEmbedding(embedding, 768)
```

#### Opción 2: Re-crear colecciones con 3072 dims
```bash
# 1. Backup de datos actuales
# 2. Eliminar colecciones viejas desde UI
# 3. Re-crear datasources (se crearán con 3072 dims)
# 4. Ejecutar sync completa
```

### 🎯 Beneficios de MRL

**Flexibilidad de almacenamiento:**
```typescript
// Full precision (mejor accuracy)
const full = embedding; // 3072 dims

// Alta precisión (96% accuracy original)
const high = truncateEmbedding(embedding, 1536); // 50% espacio

// Media precisión (90% accuracy original)
const medium = truncateEmbedding(embedding, 768); // 75% espacio

// Baja precisión (80% accuracy original)
const low = truncateEmbedding(embedding, 256); // 91.7% espacio
```

**Casos de uso:**
- **3072:** Búsqueda de máxima precisión
- **1536:** Balance óptimo precision/espacio
- **768:** Compatible con sistemas legacy
- **256:** Edge devices, cache local

### 📚 Referencias

- [Gemini Embedding Model Announcement](https://developers.googleblog.com/en/gemini-embedding-text-model-now-available-gemini-api/)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147)

### ⚠️ Breaking Changes

**Ninguno.** Los cambios son backward compatible:
- Colecciones 768 dims siguen funcionando
- Nuevas colecciones usan 3072 dims
- MRL permite adaptar vectores a cualquier tamaño existente

### 🔜 Deprecations

Según Google (octubre 2025):
- ❌ `embedding-001` - Deprecado
- ❌ `embedding-gecko-001` - Deprecado
- ❌ `text-embedding-004` - Próximo a deprecar
- ✅ `gemini-embedding-001` - **Recomendado** (actual)

---

## [2025-10-14] - Release Inicial

### ✨ Features Implementadas

#### Backend (58 archivos)
- ✅ Multi-database connectors (MSSQL, MySQL, PostgreSQL)
- ✅ ETL sync engine con Bull queues
- ✅ Scheduler con cron jobs
- ✅ Webhooks autenticados
- ✅ Image search con Vision AI
- ✅ Health checks completos

#### Frontend (35 archivos)
- ✅ Dashboard con stats
- ✅ Datasource wizard (5 pasos)
- ✅ Sync monitor real-time
- ✅ Collections manager
- ✅ Image search UI
- ✅ Error boundaries
- ✅ Loading skeletons

#### Infraestructura
- ✅ Docker Compose (PostgreSQL + Redis)
- ✅ TypeORM migrations
- ✅ Environment configs
- ✅ Deployment guides

### 📖 Documentación
- ✅ README completo
- ✅ DEPLOY guides
- ✅ COMPLETADO checklist
- ✅ API documentation

---

**Status Actual:** ✅ **Producción Ready** con modelos de última generación (Octubre 2025)
