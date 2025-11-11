# 🚨 FIX URGENTE - DOCKER COMPOSE PRODUCTION

## 🔍 **PROBLEMA IDENTIFICADO:**

Los cambios de hoy (commits 5f0c518 y c37bdcc) **hardcodearon URLs** que conflictan con la configuración Docker que funcionaba.

### ❌ **Lo que se rompió:**
- Frontend hardcodeado a `http://192.168.40.197:3001/api`
- No respeta `NEXT_PUBLIC_API_URL=http://backend:3001/api` del Docker
- CORS no incluía nombres de servicios Docker internos

## ✅ **SOLUCIÓN APLICADA:**

### 1. **Frontend ahora respeta variables de entorno Docker:**
```typescript
// frontend/lib/api.ts - NUEVA LÓGICA:
function getApiBaseUrl(): string {
  // 1️⃣ PRIORIDAD: Variable de Docker/build time
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;  // http://backend:3001/api
  }
  
  // 2️⃣ BROWSER: Detección dinámica IP
  if (typeof window !== 'undefined') {
    return `${protocol}//${hostname}:3001/api`;  // http://192.168.40.197:3001/api
  }
  
  // 3️⃣ FALLBACK: IP directa para despliegues sin Docker
  return 'http://192.168.40.197:3001/api';
}
```

### 2. **CORS ampliado para Docker:**
```typescript
// backend/src/main.ts - AGREGADOS:
'http://frontend:3000',        // Docker service name
'http://bip2-frontend:3000',   // Docker container name
```

## 🚀 **INSTRUCCIONES PARA DEPLOY:**

### **Para Docker Compose (TU CASO):**
```bash
# 1. Pull del fix
cd /opt/proyectos/bip2
git pull origin main

# 2. Rebuild solo el backend (para CORS fix)
docker compose down backend
docker compose up -d --build backend

# 3. El frontend NO necesita rebuild si ya tienes la imagen
# La imagen local bip2-frontend:latest seguirá usando:
# NEXT_PUBLIC_API_URL=http://backend:3001/api (CORRECTO para Docker)

# 4. Si tienes dudas, rebuild también el frontend:
cd frontend
docker build -t bip2-frontend:latest .
cd ..
docker compose up -d frontend
```

## 🎯 **COMPORTAMIENTO ESPERADO:**

### **En Docker (tu docker-compose.yml):**
- ✅ Frontend usa: `http://backend:3001/api` (variable Docker)
- ✅ Backend permite CORS desde contenedor frontend
- ✅ Comunicación interna entre contenedores

### **En despliegue directo (sin Docker):**
- ✅ Frontend detecta: `http://192.168.40.197:3001/api` (IP real)
- ✅ Backend permite CORS desde IP del servidor

## 📋 **VERIFICACIÓN:**

```bash
# 1. Verificar que backend acepta requests
curl http://192.168.40.197:3001/api/health

# 2. Verificar frontend (debería cargar sin errores CORS)
curl -I http://192.168.40.197:3011

# 3. Si hay errores, check logs:
docker compose logs backend
docker compose logs frontend
```

## 🔧 **ROLLBACK SI NECESARIO:**

Si algo sigue fallando, puedes hacer rollback al commit anterior:
```bash
git reset --hard a545e5c  # Commit antes de nuestros cambios
docker compose down
docker compose up -d --build
```

---

**NOTA:** Tu docker-compose.yml está perfecto. El problema era que nuestro código no respetaba las variables Docker. Ahora sí las respeta. ✅