# GUÍA DE DESPLIEGUE EN PORTAINER - Web Editor

## PASO 1: Acceder a Portainer Web Editor

1. Abre el navegador y accede a tu Portainer: `http://tu-ip-portainer:9000`
2. Inicia sesión con tu usuario
3. Selecciona el entorno (Endpoint) donde quieres desplegar
4. Ve a **Stacks** en el menú lateral
5. Haz clic en **Add Stack** (o **Create Stack**)
6. Selecciona **Web Editor**

---

## PASO 2: Copiar el siguiente contenido en el Web Editor

Copia y pega el contenido completo del `docker-compose.yml` que se proporciona abajo en el editor de Portainer.

**IMPORTANTE:** Antes de pegar, lee las secciones de configuración.

---

## PASO 3: Configuración de Variables de Entorno

En Portainer, deberás configurar las siguientes variables en la sección **Environment variables** o en el Web Editor:

### Variables Obligatorias:
- `GEMINI_API_KEY` - Tu clave de API de Google Gemini
- `JWT_SECRET` - Clave secreta para JWT (usa una contraseña fuerte)

### Variables Opcionales (Azure AD):
- `AZURE_AD_CLIENT_ID` - ID del cliente de Azure AD
- `AZURE_AD_CLIENT_SECRET` - Secreto del cliente de Azure AD
- `AZURE_AD_TENANT_ID` - ID del tenant de Azure AD

---

## PASO 4: Contenido del Web Editor

Copia TODO esto en el Web Editor de Portainer:

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: qdrant-sync-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: qdrant_sync
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - bip2-network

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: qdrant-sync-redis
    ports:
      - "6380:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - bip2-network

  # MySQL for Canasta Básica
  mysql:
    image: mysql:8.0
    container_name: efc-canasta-mysql
    ports:
      - "3307:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: canasta_basica
      MYSQL_USER: efc
      MYSQL_PASSWORD: efc123
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot123"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    command: --default-authentication-plugin=mysql_native_password
    networks:
      - bip2-network

  # Qdrant Vector Database
  qdrant:
    image: qdrant/qdrant:latest
    container_name: efc-qdrant-local
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      QDRANT__SERVICE__GRPC_PORT: "6334"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/collections"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - bip2-network

  # NestJS Backend
  backend:
    build:
      context: https://github.com/alannreyes/bip2.git#main
      dockerfile: backend/Dockerfile
    container_name: bip2-backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
      APP_URL: http://backend:3001
      
      # Database PostgreSQL
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USERNAME: postgres
      DATABASE_PASSWORD: postgres
      DATABASE_NAME: qdrant_sync
      
      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ""
      
      # Qdrant
      QDRANT_HOST: qdrant
      QDRANT_PORT: 6333
      QDRANT_API_KEY: ""
      
      # Gemini API - REEMPLAZAR CON TU CLAVE REAL
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      
      # CORS
      CORS_ORIGIN: http://localhost:3011,http://frontend:3000
      
      # JWT
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      
      # Azure AD (Opcional)
      AZURE_AD_CLIENT_ID: ${AZURE_AD_CLIENT_ID:-}
      AZURE_AD_CLIENT_SECRET: ${AZURE_AD_CLIENT_SECRET:-}
      AZURE_AD_TENANT_ID: ${AZURE_AD_TENANT_ID:-}
      AZURE_AD_REDIRECT_URI: http://localhost:3001/api/auth/callback
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - bip2-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Next.js Frontend
  frontend:
    build:
      context: https://github.com/alannreyes/bip2.git#main
      dockerfile: frontend/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://backend:3001/api
    container_name: bip2-frontend
    ports:
      - "3011:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://backend:3001/api
      NODE_ENV: production
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - bip2-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  mysql_data:
    driver: local
  qdrant_data:
    driver: local

networks:
  bip2-network:
    driver: bridge
```

---

## PASO 5: Agregar Variables de Entorno en Portainer

En el Web Editor, después del contenido del docker-compose.yml, encontrarás una sección **Environment variables**.

Agrega las siguientes variables:

```
GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
JWT_SECRET=tu-jwt-secret-super-seguro-aqui
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
```

---

## PASO 6: Desplegar el Stack

1. En el Web Editor, desplaza hacia abajo
2. Dale un **nombre** al stack (ej: `bip2-production`)
3. Haz clic en **Deploy the stack**
4. Espera a que termine la compilación (puede tardar 5-10 minutos la primera vez)

---

## PASO 7: Verificar el Despliegue

1. Accede a **Containers** en Portainer
2. Verifica que todos los contenedores estén `running`:
   - `qdrant-sync-postgres`
   - `qdrant-sync-redis`
   - `efc-canasta-mysql`
   - `efc-qdrant-local`
   - `bip2-backend`
   - `bip2-frontend`

3. Revisa los logs si alguno no inicia correctamente

---

## PASO 8: Acceder a la Aplicación

Una vez desplegado:

- **Frontend**: `http://tu-ip-servidor:3011`
- **Backend API**: `http://tu-ip-servidor:3001/api`
- **API Docs**: `http://tu-ip-servidor:3001/api/docs`
- **Qdrant Console**: `http://tu-ip-servidor:6333/dashboard`

---

## TROUBLESHOOTING

### El backend no inicia
- Verifica los logs: Portainer → Containers → bip2-backend → Logs
- Asegúrate de que `GEMINI_API_KEY` esté configurada

### El frontend no se conecta al backend
- Verifica que `NEXT_PUBLIC_API_URL` apunte a `http://backend:3001/api`
- Revisa los logs del navegador (F12 → Console)

### La base de datos no se inicializa
- Espera al menos 40 segundos (start_period)
- Verifica que PostgreSQL sea accesible desde el backend

### Qdrant no responde
- Verifica que el healthcheck de Qdrant sea correcto
- Intenta acceder a `http://tu-ip-servidor:6333` en el navegador

---

## NOTAS IMPORTANTES

- Los Dockerfiles se descargan automáticamente desde GitHub
- Los volúmenes persisten los datos incluso si los contenedores se detienen
- Las redes internas `bip2-network` permiten que los contenedores se comuniquen entre sí
- Todos los servicios usan `unless-stopped` para reiniciarse automáticamente

