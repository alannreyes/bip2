# 🛡️ Data Safety & Docker Best Practices

## El Problema

Antes se usaban volúmenes Docker named (`postgres_data`, `redis_data`, `qdrant_data`), que se BORRABAN con:
```bash
docker-compose down -v  # ❌ NUNCA USAR - Borra TODOS los datos
```

## La Solución

Ahora usamos **bind mounts** - directorios del host en `./data/`:
- `./data/postgres/` → Datos de PostgreSQL
- `./data/redis/` → Cache de Redis
- `./data/qdrant/` → Base de datos vectorial Qdrant

Los datos están **SIEMPRE SEGUROS** en el filesystem del host.

---

## 📋 Comandos Seguros

### **Reiniciar sin perder datos:**
```bash
# Opción 1: Restart (lo más rápido)
docker-compose restart

# Opción 2: Down sin -v (preserva datos)
docker-compose down
docker-compose up -d
```

### **NUNCA hacer esto:**
```bash
# ❌ PROHIBIDO - Borra TODOS los volúmenes
docker-compose down -v

# ❌ PROHIBIDO - Borra TODOS los volúmenes
docker volume prune -f
```

### **Hacer backup de datos:**
```bash
# Backup completo
tar -czf backup-$(date +%Y%m%d).tar.gz ./data/

# Restaurar desde backup
tar -xzf backup-20251107.tar.gz
```

---

## 🔍 Verificar que los datos existen

```bash
# Ver estructura de directorios
ls -lah ./data/

# Ver tamaño de cada base de datos
du -sh ./data/postgres ./data/redis ./data/qdrant

# Verificar que PostgreSQL está usando el bind mount
docker exec bip2-qa-postgres ls -la /var/lib/postgresql/data

# Verificar que Qdrant está usando el bind mount
docker exec bip2-qa-qdrant ls -la /qdrant/storage
```

---

## 🚀 Flujo Seguro para Desarrollo

```bash
# 1. Clonar el proyecto
git clone <repo>
cd bip2

# 2. Crear directorios de datos (si no existen)
mkdir -p ./data/{postgres,redis,qdrant}

# 3. Configurar environment
cp .env.example .env
# Editar .env con tus valores

# 4. Iniciar stack
docker-compose up -d

# 5. Esperar a que esté listo
sleep 30

# 6. Verificar salud
curl http://localhost:3001/api/health
```

---

## 📊 Diferencia: Named Volumes vs Bind Mounts

| Aspecto | Named Volumes | Bind Mounts (ACTUAL) |
|--------|---------------|----------------------|
| Ubicación | `/var/lib/docker/volumes/` | `./data/` (visible) |
| Backup | Difícil | Fácil (`tar`) |
| Portabilidad | Media | Alta |
| Visibilidad | Baja | Alta |
| Seguridad ante `down -v` | ❌ PIERDE TODO | ✅ PRESERVA TODO |
| Git control | No necesario | En `.gitignore` |

---

## 🎯 Resumen de Cambios

### Docker-Compose
```yaml
# ANTES (con riesgo):
volumes:
  postgres_data:
    driver: local

# AHORA (seguro):
volumes:
  postgres:
    - ./data/postgres:/var/lib/postgresql/data
```

### .gitignore
```
# Se agregó:
data/
data/postgres/
data/redis/
data/qdrant/
```

---

## ⚠️ Notas Importantes

1. **SIEMPRE usa `docker-compose down` sin `-v`**
2. **Haz backups periódicos del directorio `./data/`**
3. **El `.env` contiene secrets - NUNCA lo commitees a git**
4. **El directorio `./data/` está en `.gitignore` - permanecerá en el host**

---

## Comandos de Emergencia

```bash
# Si algo falla y necesitas reset COMPLETO:
docker-compose down          # Apaga contenedores
docker-compose up -d         # Reinicia con datos preservados

# Solo si REALMENTE quieres borrar TODO:
docker-compose down -v       # Borra volúmenes Docker
rm -rf ./data/               # Borra los bind mounts (⚠️ CUIDADO)
docker-compose up -d         # Arranca desde cero
```

---

## Monitoreo

```bash
# Ver logs en tiempo real
docker-compose logs -f backend

# Ver uso de espacio
docker system df

# Limpiar solo lo seguro
docker system prune -f  # No toca volúmenes
```
