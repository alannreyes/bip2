# ✅ CHECKLIST POST-DESPLIEGUE EN PORTAINER

## 🔍 VERIFICACIÓN DE CONTENEDORES

Después de hacer deploy, en Portainer → Containers, verifica que todos estén **running**:

```
☐ qdrant-sync-postgres          (Verde - running)
☐ qdrant-sync-redis             (Verde - running)
☐ efc-canasta-mysql             (Verde - running)
☐ efc-qdrant-local              (Verde - running)
☐ bip2-backend                  (Verde - running)
☐ bip2-frontend                 (Verde - running)
```

Si alguno está en rojo o amarillo, revisa sus logs.

---

## 🔗 VERIFICACIÓN DE CONECTIVIDAD

### Desde tu navegador, accede a:

```
☐ http://tu-ip:3011               (Frontend debería cargar)
☐ http://tu-ip:3001/api           (API debería responder)
☐ http://tu-ip:3001/api/docs      (Swagger documentation)
☐ http://tu-ip:3001/api/health    (Debe mostrar JSON con status)
☐ http://tu-ip:6333               (Qdrant debería responder)
```

### Resultado esperado:

**Frontend (3011)**: Página con búsqueda semántica
**API (3001/api)**: Mensaje de bienvenida o error 404
**API Docs (3001/api/docs)**: Interfaz Swagger con endpoints
**Health (3001/api/health)**: JSON mostrando estado de servicios
**Qdrant (6333)**: Información de Qdrant en JSON

---

## 📊 VERIFICACIÓN DE DATOS

### 1. Verificar que Frontend pueda obtener datos

Abre tu navegador y:

1. Presiona **F12** para abrir Developer Tools
2. Ve a la pestaña **Console**
3. Debería NO mostrar errores de CORS
4. Si hay datos, deberían aparecer en pantalla

### 2. Verificar que API responde

```bash
curl http://tu-ip:3001/api/collections
```

Debería devolver un JSON con las colecciones (puede estar vacío).

### 3. Verificar que Qdrant tiene datos

```bash
curl http://tu-ip:6333/collections
```

Debería mostrar las colecciones disponibles.

---

## 🗄️ VERIFICACIÓN DE BASES DE DATOS

### PostgreSQL

```bash
psql -h tu-ip -p 5433 -U postgres -d qdrant_sync
```

Dentro de psql:
```sql
\dt                    -- Listar tablas
SELECT COUNT(*) FROM datasources;  -- Contar datasources
\q                     -- Salir
```

### MySQL

```bash
mysql -h tu-ip -P 3307 -u efc -p efc123 canasta_basica
```

Dentro de mysql:
```sql
SHOW TABLES;
SELECT COUNT(*) FROM canasta_basica;
EXIT;
```

### Redis

```bash
redis-cli -h tu-ip -p 6380
PING
DBSIZE
EXIT
```

---

## 🔐 VERIFICACIÓN DE VARIABLES DE ENTORNO

En Portainer → Containers → bip2-backend → Inspect

Busca la sección **Environment** y verifica:

```
✅ GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
✅ JWT_SECRET=tu-secreto-aqui
✅ DATABASE_HOST=postgres
✅ QDRANT_HOST=qdrant
✅ NODE_ENV=production
```

---

## 📝 VERIFICACIÓN DE LOGS

En Portainer → Containers → [nombre del servicio] → Logs

### Backend debe mostrar:

```
🚀 Application is running on: http://localhost:3001/api
📚 API Documentation: http://localhost:3001/api/docs
[QdrantService] Qdrant client initialized: qdrant:6333
```

### Frontend debe mostrar:

```
Ready in 3.5s
Listening on port 3000
✓ Compiled successfully
```

---

## 🚨 SEÑALES DE ALERTA

| Señal | Problema | Solución |
|-------|----------|----------|
| Backend en amarillo | Unhealthy | Espera 40+ segundos y recarga |
| Frontend en rojo | No inicia | Revisa logs, verifica Dockerfile |
| Conexión rechazada | Puertos cerrados | Abre puertos en firewall |
| CORS error | Backend rechaza frontend | Verifica CORS_ORIGIN en backend |
| Base de datos no conecta | BD no está lista | Espera a que postgres inicie |
| API devuelve 500 | Error del servidor | Revisa logs del backend |

---

## 🎯 PRUEBAS FUNCIONALES

### Test 1: ¿El frontend carga?

1. Abre http://tu-ip:3011
2. ¿Ves la interfaz de búsqueda? → ✅
3. ¿Hay errores en la consola (F12)? → ❌ No debería haber

### Test 2: ¿El API responde?

1. Abre http://tu-ip:3001/api/collections
2. ¿Ves JSON? → ✅
3. ¿Está vacío o tiene datos? → ✅ Ambos están bien

### Test 3: ¿Las bases de datos están OK?

1. Accede a PostgreSQL (instrucciones arriba)
2. ¿Hay tablas? → ✅
3. ¿Hay datos? → ✅ (Si migraste datos)

### Test 4: ¿Qdrant está listo?

1. Abre http://tu-ip:6333 en navegador
2. ¿Ves JSON? → ✅
3. ¿Hay colecciones? → ✅ (Depende de tu data)

---

## 📊 PERFORMANCE BASELINE

Después de desplegar, toma nota de:

```
┌─────────────────────────────────────────┐
│ BASELINE DE PERFORMANCE                 │
├─────────────────────────────────────────┤
│ Frontend load time:     ___ ms          │
│ API response time:      ___ ms          │
│ Database query time:    ___ ms          │
│ Qdrant search time:     ___ ms          │
│ CPU usage:              ___ %           │
│ Memory usage:           ___ %           │
│ Disk space used:        ___ GB          │
└─────────────────────────────────────────┘
```

Esto te ayudará a detectar degradación futura.

---

## 🔄 MANTENIMIENTO POST-DESPLIEGUE

### Diario
- ✅ Revisar logs del backend en Portainer
- ✅ Verificar que todos los contenedores estén running
- ✅ Confirmar que el frontend es accesible

### Semanal
- ✅ Backup de volúmenes PostgreSQL
- ✅ Revisar uso de disco
- ✅ Verificar que Qdrant responde correctamente

### Mensual
- ✅ Actualizar imágenes base (postgres, redis, etc.)
- ✅ Limpiar logs antiguos
- ✅ Revisar consumo de recursos
- ✅ Backup completo del stack

---

## ✅ REGISTRO DE DESPLIEGUE

Completa esto después del despliegue:

```
Fecha de despliegue: ________________
Hora de inicio:      ________________
Hora de finalización: ________________
Duración total:      ________________

Stack name:          bip2-production
Endpoint:            ________________
Versión del código:  main

Contacto de soporte: alannreyesj@gmail.com

Observaciones:
_________________________________________
_________________________________________
_________________________________________
```

---

## 🎉 ¡LISTO PARA PRODUCCIÓN!

Si pasaste todas las verificaciones ✅, tu aplicación BIP2 está lista para:

- ✅ Búsqueda semántica con IA
- ✅ Sincronización de catálogos
- ✅ Gestión de datasources
- ✅ Detección de duplicados
- ✅ API REST completa

**¡Felicidades! 🚀**

