# VARIABLES DE ENTORNO PARA PORTAINER

## ⚠️ IMPORTANTE: COPIA ESTAS VARIABLES EN PORTAINER

En Portainer, en la sección "Environment variables" del Stack, agrega estas líneas exactamente:

---

## CONFIGURACIÓN OBLIGATORIA

```
GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
JWT_SECRET=your-super-secure-jwt-secret-key-here-min-32-chars
```

---

## CONFIGURACIÓN OPCIONAL (Azure AD)

Si usas autenticación con Azure AD, descomenta y configura:

```
AZURE_AD_CLIENT_ID=tu-client-id-aqui
AZURE_AD_CLIENT_SECRET=tu-client-secret-aqui
AZURE_AD_TENANT_ID=tu-tenant-id-aqui
```

Si NO usas Azure AD, DEJA ESTOS EN BLANCO o déjalos así:

```
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
```

---

## CÓMO AGREGARLOS EN PORTAINER

### Opción A: Durante la creación del Stack

1. En Web Editor, desplaza hasta el final
2. Busca la sección **Environment variables**
3. Haz clic en **Add variable**
4. Ingresa cada variable como clave-valor

### Opción B: Después de crear el Stack

1. Ve a **Stacks** → Tu stack (`bip2-production`)
2. Haz clic en **Editor**
3. Desplaza a **Environment variables**
4. Agrega o modifica los valores

---

## 🔒 SEGURIDAD

### JWT_SECRET
- Debe ser una cadena fuerte con mínimo 32 caracteres
- Usa caracteres alfanuméricos y símbolos
- NO uses espacios
- Ejemplo seguro: `Alann@2024!SecureJWTKeyForProduction123XYZ`

### GEMINI_API_KEY
- Esta es la clave actual, asegúrate de cambiarla si es necesario
- NO compartas esta clave públicamente
- Si se compromete, regenera una nueva en Google Cloud Console

### Credenciales de Bases de Datos
- Ya están configuradas en el docker-compose
- PostgreSQL: `postgres / postgres` (cambiar en producción)
- MySQL: `efc / efc123` (cambiar en producción)
- Redis: sin contraseña (configurar si es necesario)

---

## PLANTILLA COMPLETA PARA COPIAR-PEGAR

Si usas la interfaz de Portainer y no ves el campo de variables, copia esto directamente:

```
GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
JWT_SECRET=Alann@2024!SecureJWTKeyForProduction123XYZ
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
```

---

## VERIFICACIÓN POST-DESPLIEGUE

Después de desplegar, verifica que las variables estén cargadas correctamente:

1. Ve a Portainer → Containers → `bip2-backend`
2. Busca la sección **Environment** 
3. Confirma que `GEMINI_API_KEY` y `JWT_SECRET` estén presentes

