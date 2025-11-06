# Variables de Entorno para Frontend en Portainer

## Variables Requeridas para el Frontend

En Portainer, para el servicio **frontend**, solo necesitas estas variables:

### Variables Obligatorias:

1. **NODE_ENV**
   - Valor: `production`
   - Descripción: Indica que la aplicación está en modo producción

2. **NEXT_PUBLIC_API_URL**
   - **Para un solo stack (todo junto)**: `http://backend:3001/api`
     - Usa el nombre del servicio del backend (`backend`) porque están en la misma red Docker
   - **Si backend está en otro stack**: `http://192.168.40.197:3001/api`
     - Usa la IP del servidor porque están en redes diferentes
   - Descripción: URL del backend API que usará el frontend

### Variables Opcionales:

3. **PORT** (si quieres cambiar el puerto interno)
   - Valor: `3000` (por defecto)
   - Descripción: Puerto interno del contenedor

## Configuración en Portainer (Un Solo Stack)

Cuando despliegas todo en un solo stack, en el editor de variables de entorno del servicio `frontend`, configura **SOLO estas dos variables**:

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://backend:3001/api
```

**IMPORTANTE - Variables que NO van en el frontend:**
- ❌ `DATABASE_*` → Son para el backend
- ❌ `REDIS_*` → Son para el backend  
- ❌ `QDRANT_*` → Son para el backend
- ❌ `GEMINI_API_KEY` → Es para el backend
- ❌ `JWT_SECRET` → Es para el backend
- ❌ `CORS_ORIGIN` → Es para el backend

**El frontend solo necesita:**
- ✅ `NODE_ENV=production`
- ✅ `NEXT_PUBLIC_API_URL=http://backend:3001/api` (usa el nombre del servicio porque están en la misma red Docker)

## ¿Por qué NODE_ENV=production en variables de entorno?

- El Dockerfile ya maneja `NODE_ENV=development` durante el **build** (para instalar devDependencies)
- Las variables de entorno en Portainer se aplican al **runtime** (cuando el contenedor corre)
- Por eso necesitamos `NODE_ENV=production` en las variables de entorno para el runtime

## Verificación

Después de configurar, verifica que:
1. El build se completa exitosamente (usa `NODE_ENV=development` del Dockerfile)
2. El contenedor inicia correctamente (usa `NODE_ENV=production` de las variables de entorno)
3. El frontend puede conectarse al backend (verifica `NEXT_PUBLIC_API_URL`)

