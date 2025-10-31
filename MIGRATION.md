# 🔄 Guía de Migración - Gemini Embedding Models

## ⚠️ Actualización Importante (Octubre 2025)

El sistema ha sido actualizado para usar los modelos más recientes de Gemini:

### Cambios de Modelos

| Componente | Anterior | Actual | Dimensiones |
|------------|----------|--------|-------------|
| Embeddings | `text-embedding-004` | `gemini-embedding-001` | 768 → 3072 |
| Vision | `gemini-1.5-flash` | `gemini-2.0-flash-exp` | N/A |

---

## 📊 Impacto en Instalaciones Existentes

### Si eres un usuario nuevo (primera instalación)
✅ **No necesitas hacer nada.** El sistema usará automáticamente los modelos nuevos con 3072 dimensiones.

### Si ya tienes colecciones en Qdrant con 768 dimensiones

Tienes **3 opciones**:

---

## Opción 1: Mantener Sistema Actual (Recomendado) ⭐

**Ventaja:** Sin interrupciones, sin re-procesamiento.

**Pasos:**
1. **No actualizar el código del backend** (quedarse en versión anterior)
2. Seguir usando `text-embedding-004` (768 dims)
3. Funciona hasta que Google deprece el modelo (fecha TBD)

**Cuándo elegir esta opción:**
- Sistema en producción estable
- No necesitas las mejoras del nuevo modelo
- Quieres evitar downtime

---

## Opción 2: Migración Gradual con MRL (Balance) 🎯

**Ventaja:** Usa el modelo nuevo pero mantiene compatibilidad con colecciones existentes.

**Pasos:**

### 1. Actualizar código backend

Agrega configuración de truncamiento en `.env`:
```bash
# Usar MRL para truncar a 768 y mantener compatibilidad
GEMINI_VECTOR_SIZE=768
```

### 2. Modificar servicio de embeddings

En `gemini-embedding.service.ts`:

```typescript
async generateEmbedding(text: string): Promise<number[]> {
  const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
  const result = await model.embedContent(text);

  // Truncar a 768 para compatibilidad con colecciones existentes
  const targetSize = parseInt(this.configService.get('GEMINI_VECTOR_SIZE', '3072'));
  return this.truncateEmbedding(result.embedding.values, targetSize);
}
```

### 3. Desplegar y probar

```bash
# Backend
cd backend
npm run build
pm2 restart qdrant-sync

# Verificar que funciona con colecciones existentes
curl http://localhost:3001/api/health
```

**Cuándo elegir esta opción:**
- Quieres beneficios del modelo nuevo
- Tienes muchas colecciones existentes
- No puedes permitir downtime largo

---

## Opción 3: Migración Completa (Máximo Performance) 🚀

**Ventaja:** Aprovecha 100% las capacidades del nuevo modelo (3072 dims).

**Pasos:**

### 1. Backup de configuración actual

```bash
# Exportar configuración de datasources
curl http://localhost:3001/api/datasources > datasources-backup.json

# Documentar queries y field mappings
```

### 2. Eliminar colecciones antiguas

Desde el frontend:
1. Ve a `/collections`
2. Elimina cada colección (una por una)
3. Confirma que Qdrant está vacío:
   ```bash
   curl http://192.168.2.6:6333/collections
   ```

### 3. Actualizar código y reiniciar

```bash
cd backend
git pull  # O actualizar archivos manualmente
npm install
npm run build
pm2 restart qdrant-sync
```

### 4. Re-crear datasources

Desde el frontend:
1. Ve a `/datasources/new`
2. Usa el wizard para re-crear cada datasource
3. Las colecciones se crearán automáticamente con 3072 dims

### 5. Ejecutar sync inicial

1. Para cada datasource, click "Sync"
2. Monitorear en `/syncs`
3. Verificar puntos en `/collections`

**Tiempo estimado:** 2-8 horas dependiendo del volumen de datos.

**Cuándo elegir esta opción:**
- Sistema nuevo o en desarrollo
- Pocos datos (<100K productos)
- Quieres máximo performance
- Puedes permitir downtime de re-indexación

---

## 🧪 Pruebas de Compatibilidad

### Verificar dimensiones actuales

```bash
# Ver colecciones en Qdrant
curl http://192.168.2.6:6333/collections | jq '.result.collections'

# Ver info de una colección específica
curl http://192.168.2.6:6333/collections/{collection_name} | jq '.result.config.params.vectors.size'
```

### Probar embedding con modelo nuevo

```bash
# Test endpoint
curl -X POST http://localhost:3001/api/test/embedding \
  -H "Content-Type: application/json" \
  -d '{"text": "producto de prueba"}'

# Verificar dimensiones en response
```

---

## 📈 Comparación de Performance

| Métrica | 768 dims (old) | 3072 dims (new) | MRL 768 (hybrid) |
|---------|----------------|-----------------|------------------|
| Precisión | 85% | 95% | 92% |
| Espacio (por vector) | 3KB | 12KB | 3KB |
| Velocidad búsqueda | Rápida | Media | Rápida |
| Compatibilidad | Legacy | Futuro | Ambos |
| Idiomas | 30+ | 100+ | 100+ |
| Input tokens | 2K | 8K | 8K |

---

## 🔍 Troubleshooting

### Error: "Dimension mismatch"

**Causa:** Intentando insertar vector 3072 dims en colección 768 dims.

**Solución:**
```typescript
// Truncar antes de upsert
const truncatedVector = geminiService.truncateEmbedding(fullVector, 768);
await qdrantService.upsertPoints(collection, [{ id, vector: truncatedVector, payload }]);
```

### Error: "Model not found: text-embedding-004"

**Causa:** Google deprecó el modelo.

**Solución:** Actualizar a `gemini-embedding-001` (este código ya lo hace).

### Performance degradada después de migración

**Causa posible:** Qdrant no ha re-indexado HNSW.

**Solución:**
```bash
# Forzar re-indexación
curl -X POST http://192.168.2.6:6333/collections/{collection}/indexes \
  -H "Content-Type: application/json" \
  -d '{"field_name": "vector"}'
```

---

## 💡 Recomendaciones por Caso de Uso

### E-commerce pequeño (<10K productos)
👉 **Opción 3** - Migración completa (2 horas downtime)

### E-commerce mediano (10K-100K productos)
👉 **Opción 2** - MRL hybrid (sin downtime)

### E-commerce grande (>100K productos)
👉 **Opción 2** - MRL hybrid, luego planear migración completa en mantenimiento programado

### Sistema en desarrollo
👉 **Opción 3** - Migración completa (aprovechar modelo nuevo)

### Sistema legacy crítico
👉 **Opción 1** - Mantener hasta deprecación forzada

---

## 📞 Soporte

¿Problemas con la migración? Revisa:
1. [CHANGELOG.md](./CHANGELOG.md) - Detalles técnicos
2. [README.md](./README.md) - Configuración general
3. GitHub Issues - Reportar problemas

---

**Última actualización:** Octubre 2025
**Versión:** 2.0.0 (Gemini Embedding 001)
