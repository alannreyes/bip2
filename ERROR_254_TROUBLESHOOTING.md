# 🔧 SOLUCIÓN: ERROR 254 EN PORTAINER

## ¿Qué es el Error 254?

Error 254 = **Problema de autenticación o permisos** al clonar desde GitHub

---

## ✅ SOLUCIÓN PASO A PASO

### Opción 1: USAR GIT CLI TOKEN (RECOMENDADO)

En lugar de usar el token directamente en la URL, usa credenciales de git:

#### 1. En tu máquina local, ejecuta:

```bash
git config --global credential.helper store
echo "https://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@github.com" | git credential approve
```

#### 2. Verifica que funcionó:

```bash
git credential-cache get https://github.com
# Debería retornar tu token
```

---

### Opción 2: USAR SSH EN VEZ DE HTTPS

Si tienes SSH configurado en GitHub:

1. En Portainer, usa:
```
git@github.com:alannreyes/bip2.git
```

2. Asegúrate que la clave SSH sea válida:
```bash
ssh -T git@github.com
# Debería decir: Hi alannreyes! You've successfully authenticated
```

---

### Opción 3: CREAR UN PERSONAL ACCESS TOKEN NUEVO

El token actual podría estar expirado. Crea uno nuevo:

#### En GitHub.com:

1. Ve a **Settings** → **Developer settings** → **Personal access tokens**
2. Click **Generate new token (classic)**
3. Dale un nombre: `portainer-deployment`
4. Scopes necesarios:
   - ✅ `repo` (acceso completo a repositorios)
   - ✅ `read:user`

5. Copia el token nuevo
6. En Portainer, actualiza la URL a:
```
https://<NEW_TOKEN>@github.com/alannreyes/bip2.git
```

---

### Opción 4: USAR DOCKERFILE CON CREDENCIALES

En lugar de usar git directamente, modifica el docker-compose para pasar credenciales:

```yaml
services:
  backend:
    build:
      context: https://github.com/alannreyes/bip2.git#main
      dockerfile: Dockerfile
      args:
        - GIT_TOKEN=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
```

---

## 🔍 VERIFICACIÓN RÁPIDA

### 1. ¿El repositorio es público?

```bash
curl -I https://github.com/alannreyes/bip2
# Debería retornar 200, no 404
```

Si es privado, necesitas token. Si es público, el token no es necesario.

### 2. ¿El token es válido?

```bash
curl -H "Authorization: token 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" \
  https://api.github.com/user
# Debería retornar tu información de usuario
```

### 3. ¿Git puede clonar?

```bash
git clone https://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@github.com/alannreyes/bip2.git test-clone
# Si funciona, el problema es con Portainer, no con Git
```

---

## 🐳 SOLUCIÓN RÁPIDA PARA PORTAINER

### Usa este docker-compose SIMPLIFICADO:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: qdrant_sync
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    volumes:
      - redis_data:/data

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_USER: efc
      MYSQL_PASSWORD: efc123
      MYSQL_DATABASE: canasta_basica
    ports:
      - "3307:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  backend:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npm run start:prod"
    environment:
      NODE_ENV: production
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USER: postgres
      DATABASE_PASSWORD: postgres
      DATABASE_NAME: qdrant_sync
      REDIS_HOST: redis
      REDIS_PORT: 6379
      QDRANT_HOST: qdrant
      QDRANT_PORT: 6333
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_USER: efc
      MYSQL_PASSWORD: efc123
      MYSQL_DATABASE: canasta_basica
      GEMINI_API_KEY: AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
      JWT_SECRET: tu-secreto-super-seguro
      CORS_ORIGIN: http://localhost:3011
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
      - mysql
      - qdrant
    volumes:
      - /tmp/bip2-backend:/app

  frontend:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npm run build && npm start"
    environment:
      NEXT_PUBLIC_API_URL: http://backend:3001/api
    ports:
      - "3011:3011"
    depends_on:
      - backend
    volumes:
      - /tmp/bip2-frontend:/app

volumes:
  postgres_data:
  redis_data:
  mysql_data:
  qdrant_data:

networks:
  default:
    name: bip2-network
```

**Ventaja**: No depende de GitHub, solo necesita las imágenes base (que ya están en Docker Hub).

---

## 📋 CHECKLIST DE SOLUCIÓN

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Verifica que el repositorio sea accesible públicamente | ☐ |
| 2 | Prueba el token con curl | ☐ |
| 3 | Intenta clonar manualmente con `git clone` | ☐ |
| 4 | Si falla, crea un token nuevo en GitHub | ☐ |
| 5 | En Portainer, usa el docker-compose simplificado | ☐ |
| 6 | Intenta hacer deploy nuevamente | ☐ |

---

## 🚀 SI NADA FUNCIONA:

### Usa esta alternativa OFFLINE (sin GitHub):

1. **En tu máquina local**, prepara el código:
```bash
cd /opt/proyectos/bip2
tar -czf bip2-code.tar.gz backend frontend docker-compose.yml
```

2. **Sube el archivo a un servidor** (S3, dropbox, etc)

3. **En Portainer**, crea un stack manual:
```yaml
version: '3.8'
services:
  # ... (igual al docker-compose de arriba)
  # En lugar de clonar de GitHub, descarga y extrae el tar.gz
```

---

## 📞 CONTACTO & LOGS

Para más detalles del error, en Portainer:

1. Ve a **Containers**
2. Busca el contenedor que falló
3. Click en **Logs**
4. Copia el mensaje de error completo
5. Comparte conmigo para diagnosticar más precisamente

**Error 254 específicamente significa:**
- ❌ Git no pudo clonar el repositorio
- ❌ Problema de autenticación con GitHub
- ❌ URL incorrecta o repositorio no existe
- ❌ Permisos insuficientes en el token

---

## ✅ VALIDACIÓN FINAL

Cuando todo esté funcionando, verás en Portainer:

```
✅ Stack bip2 deployed successfully
✅ All services running (6/6)
✅ Logs showing no errors
✅ Frontend accessible at http://ip:3011
✅ Backend accessible at http://ip:3001/api
```

