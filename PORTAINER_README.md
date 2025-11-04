# 📦 DESPLIEGUE BIP2 EN PORTAINER - RESUMEN EJECUTIVO

## ✅ QUÉ SE HA PREPARADO

He creado dos archivos en tu repositorio `/opt/proyectos/bip2/`:

1. **`PORTAINER_DOCKER_COMPOSE.yml`** - El archivo limpio para copiar-pegar en Web Editor
2. **`PORTAINER_DEPLOYMENT_GUIDE.md`** - Guía completa paso a paso

---

## 🚀 PASOS RÁPIDOS PARA DESPLEGAR

### 1️⃣ EN PORTAINER WEB EDITOR:
- Ve a **Stacks → Add Stack → Web Editor**
- Copia el contenido de `PORTAINER_DOCKER_COMPOSE.yml`
- Pégalo en el editor

### 2️⃣ CONFIGURA VARIABLES DE ENTORNO:
En la sección **Environment variables** de Portainer, agrega:

```
GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
JWT_SECRET=tu-clave-secreta-segura-aqui
AZURE_AD_CLIENT_ID=(dejar vacío si no usas Azure)
AZURE_AD_CLIENT_SECRET=(dejar vacío si no usas Azure)
AZURE_AD_TENANT_ID=(dejar vacío si no usas Azure)
```

### 3️⃣ DEPLOY:
- Dale un nombre al stack: `bip2-production`
- Haz clic en **Deploy the stack**
- Espera 5-10 minutos (primer build)

---

## 📋 QUÉ SE DESPLEGARÁ

| Servicio | Puerto | URL |
|----------|--------|-----|
| **Frontend (Next.js)** | 3011 | http://tu-ip:3011 |
| **Backend API (NestJS)** | 3001 | http://tu-ip:3001/api |
| **API Docs** | 3001 | http://tu-ip:3001/api/docs |
| **PostgreSQL** | 5433 | Interno |
| **Redis** | 6380 | Interno |
| **MySQL** | 3307 | Interno |
| **Qdrant** | 6333/6334 | http://tu-ip:6333 |

---

## 🔄 CÓMO FUNCIONA

1. **GitHub Integration**: Los Dockerfiles se descargan automáticamente desde `https://github.com/alannreyes/bip2.git#main`
2. **Build Automático**: Docker construye las imágenes del backend y frontend
3. **Networking**: Los servicios se comunican via red interna `bip2-network`
4. **Healthchecks**: Cada servicio valida su salud, el backend espera a que db esté lista antes de iniciar
5. **Persistencia**: Los volúmenes mantienen los datos aunque los contenedores se detengan

---

## 🔧 CONFIGURACIÓN IMPORTANTE

### CORS (Backend)
Está configurado para aceptar solicitudes desde:
- `http://localhost:3011` (frontend local)
- `http://frontend:3000` (frontend en contenedor)

Puedes modificarlo en la variable `CORS_ORIGIN` del backend.

### Base de Datos
- PostgreSQL: usuario `postgres`, contraseña `postgres`
- Los datos se guardan en volumen `postgres_data`

### Qdrant
- Escucha en puerto 6333 (REST API)
- Puerto 6334 para gRPC
- Almacenamiento en volumen `qdrant_data`

---

## ✨ CARACTERÍSTICAS AUTOMÁTICAS

✅ **Health Checks**: Cada servicio se verifica automáticamente
✅ **Auto-restart**: Si algo falla, se reinicia automáticamente
✅ **Networking Interno**: Los contenedores se ven entre sí
✅ **Volúmenes Persistentes**: Los datos sobreviven reinicios
✅ **Logs Accesibles**: Portainer muestra los logs de cada contenedor

---

## 🐛 SI ALGO FALLA

### El backend no inicia
```
→ Revisa logs en Portainer: Containers → bip2-backend → Logs
→ Verifica GEMINI_API_KEY esté configurada
→ Espera 40+ segundos para que PostgreSQL esté listo
```

### El frontend no ve datos
```
→ Abre DevTools (F12) → Console
→ Verifica que NEXT_PUBLIC_API_URL sea correcto
→ Revisa si el backend está respondiendo en http://tu-ip:3001/api/health
```

### Los contenedores se detienen
```
→ Revisa logs en Portainer
→ Verifica que todos los volumenes tengan espacio
→ Comprueba que los puertos no estén en conflicto
```

---

## 📞 PRÓXIMOS PASOS

1. Copia `PORTAINER_DOCKER_COMPOSE.yml` 
2. Accede a tu Portainer en otro entorno
3. Usa Web Editor para desplegar
4. Configura variables de entorno
5. ¡Listo! Tu aplicación estará en producción

---

## 📝 NOTAS

- El build tardará la primera vez (5-10 minutos)
- Las compilaciones posteriores son más rápidas (caché)
- Los datos persisten en los volúmenes Docker
- Puedes ver logs en tiempo real en Portainer
- Los contenedores se reinician automáticamente si algo falla

