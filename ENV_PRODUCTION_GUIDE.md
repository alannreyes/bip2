# 🔐 Guía para Crear .env.production

Esta guía te ayudará a crear el archivo `.env.production` con los valores correctos para producción.

---

## 📋 Paso a Paso

### 1. En el Servidor de Producción

```bash
cd ~/proyectos/bip2
cp .env.production.example .env.production
nano .env.production
```

---

## 🔑 Valores a Configurar

### A. Passwords de Bases de Datos (Generar en el servidor)

```bash
# Ejecutar estos comandos en el servidor para generar passwords seguros:

# 1. Password de PostgreSQL
openssl rand -base64 32

# 2. Password de Redis
openssl rand -base64 32

# 3. JWT Secret
openssl rand -base64 48
```

**Copiar los resultados y pegarlos en el .env.production**

---

### B. API Key de Google Gemini (OBLIGATORIO)

1. **Ir a:** https://aistudio.google.com/app/apikey
2. **Iniciar sesión** con una cuenta de Google
3. **Click en "Create API Key"**
4. **Copiar la API key** (empieza con `AIzaSy...`)
5. **Pegarla en** `GEMINI_API_KEY=`

⚠️ **SIN ESTA API KEY LA APLICACIÓN NO FUNCIONA**

---

### C. Dominios (Según tu infraestructura)

Necesitas configurar **2 dominios o subdominios** que apunten a tu servidor:

**Opción 1: Subdominios (Recomendado)**
```bash
FRONTEND_DOMAIN=bip.tuempresa.com
BACKEND_DOMAIN=api.bip.tuempresa.com
```

**Opción 2: Diferentes nombres**
```bash
FRONTEND_DOMAIN=busqueda.tuempresa.com
BACKEND_DOMAIN=busqueda-api.tuempresa.com
```

**Opción 3: Con la empresa EFC (Ejemplo real)**
```bash
FRONTEND_DOMAIN=bip.efc.com.pe
BACKEND_DOMAIN=api-bip.efc.com.pe
```

#### Verificar que los dominios apunten al servidor:

```bash
nslookup bip.tuempresa.com
nslookup api.bip.tuempresa.com
```

Ambos deben devolver la **IP de tu servidor**.

---

## 📝 Archivo .env.production Completo

```bash
# ==============================================
# PRODUCCIÓN - BIP2 Semantic Search Platform
# ==============================================

# --- Database Configuration ---
POSTGRES_DB=qdrant_catalog_sync
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<PEGAR_RESULTADO_openssl_rand_32>

# --- Redis Configuration ---
REDIS_PASSWORD=<PEGAR_RESULTADO_openssl_rand_32>

# --- API Keys ---
GEMINI_API_KEY=<PEGAR_API_KEY_DE_GOOGLE_AI_STUDIO>

# --- Security ---
JWT_SECRET=<PEGAR_RESULTADO_openssl_rand_48>

# --- Domains ---
FRONTEND_DOMAIN=bip.tuempresa.com
BACKEND_DOMAIN=api.bip.tuempresa.com

# --- CORS ---
CORS_ORIGIN=https://bip.tuempresa.com

# --- Frontend API URL ---
NEXT_PUBLIC_API_URL=https://api.bip.tuempresa.com/api
```

---

## 📋 Ejemplo con Valores Reales Generados

```bash
# ==============================================
# EJEMPLO (NO USAR EN PRODUCCIÓN - GENERAR PROPIOS)
# ==============================================

POSTGRES_DB=qdrant_catalog_sync
POSTGRES_USER=postgres
POSTGRES_PASSWORD=xK9mN2pQ8vR4tY6wZ1aB3cD5eF7gH9jL0mN2pQ4rS6tU8vW=

REDIS_PASSWORD=aB3cD5eF7gH9jK1mN3pQ5rS7tU9vW1xY3zA5bC7dE9fG1hI3=

GEMINI_API_KEY=AIzaSyDexampleAPIkey1234567890abcdefghijk

JWT_SECRET=nP8qR2sT4uV6wX8yZ0aB2cD4eF6gH8iJ0kL2mN4oP6qR8sT0uV2wX4yZ6aB8cD0eF2gH4iJ6kL8mN0oP2=

FRONTEND_DOMAIN=bip.efc.com.pe
BACKEND_DOMAIN=api-bip.efc.com.pe

CORS_ORIGIN=https://bip.efc.com.pe

NEXT_PUBLIC_API_URL=https://api-bip.efc.com.pe/api
```

---

## ✅ Checklist de Verificación

Antes de hacer `docker compose up`:

- [ ] **POSTGRES_PASSWORD**: Generado con `openssl rand -base64 32`
- [ ] **REDIS_PASSWORD**: Generado con `openssl rand -base64 32`
- [ ] **JWT_SECRET**: Generado con `openssl rand -base64 48`
- [ ] **GEMINI_API_KEY**: Obtenida de Google AI Studio
- [ ] **FRONTEND_DOMAIN**: Apunta al servidor (verificado con nslookup)
- [ ] **BACKEND_DOMAIN**: Apunta al servidor (verificado con nslookup)
- [ ] **CORS_ORIGIN**: Coincide con FRONTEND_DOMAIN (con https://)
- [ ] **NEXT_PUBLIC_API_URL**: Coincide con BACKEND_DOMAIN (con https:// y /api)
- [ ] Archivo guardado como `.env.production` (no `.env.production.example`)
- [ ] Archivo NO está en Git (debe estar en .gitignore)

---

## 🔒 Seguridad

### ⚠️ IMPORTANTE:

1. **NUNCA** subir `.env.production` a Git
2. **NUNCA** usar los passwords de ejemplo en producción
3. **SIEMPRE** generar passwords únicos para cada instalación
4. **GUARDAR** una copia segura del archivo (fuera del servidor)

### Backup del .env.production

```bash
# En tu máquina local (no en el servidor)
scp usuario@servidor:~/proyectos/bip2/.env.production ~/backups/bip2-env-backup
```

---

## 🚀 Después de Crear el Archivo

Una vez que tienes el `.env.production` configurado:

```bash
# 1. Verificar que el archivo existe
ls -la .env.production

# 2. Verificar que tiene los valores correctos (sin mostrar passwords)
grep -E "DOMAIN|API_KEY" .env.production

# 3. Levantar los servicios
docker compose -f docker-compose.prod.yml up -d

# 4. Verificar logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## 🆘 Troubleshooting

### Error: "GEMINI_API_KEY is not defined"

**Causa:** La API key no está configurada o es inválida.

**Solución:**
```bash
# Verificar que está en el archivo
grep GEMINI_API_KEY .env.production

# Reiniciar el backend
docker compose -f docker-compose.prod.yml restart backend
```

### Error: "database authentication failed"

**Causa:** Password de PostgreSQL incorrecto.

**Solución:**
```bash
# Los contenedores ya están corriendo con el password viejo
# Hay que recrearlos:
docker compose -f docker-compose.prod.yml down
docker volume rm bip2_postgres_data  # ⚠️ Esto borra datos
docker compose -f docker-compose.prod.yml up -d
```

### Error: "CORS policy"

**Causa:** `CORS_ORIGIN` no coincide con el dominio del frontend.

**Solución:**
```bash
# Asegurarse de que coincidan:
FRONTEND_DOMAIN=bip.tuempresa.com
CORS_ORIGIN=https://bip.tuempresa.com  # Mismo dominio, con https://
```

---

## 📞 Ayuda

Si tienes problemas configurando el `.env.production`:

1. Verificar que los dominios apunten al servidor
2. Verificar que la API key de Gemini sea válida
3. Revisar logs: `docker compose -f docker-compose.prod.yml logs`
4. Consultar: `POST_DEPLOYMENT_GUIDE.md`

---

## 🎯 Próximo Paso

Una vez que el `.env.production` está configurado y los contenedores están corriendo:

👉 **Seguir:** `POST_DEPLOYMENT_GUIDE.md` para configurar el primer datasource
