# PASOS DETALLADOS PARA DESPLEGAR EN PORTAINER WEB EDITOR

## 📍 PASO 1: ACCEDER A PORTAINER

```
URL: http://tu-ip-portainer:9000
Usuario: tu-usuario
Contraseña: tu-contraseña
```

---

## 📍 PASO 2: SELECCIONAR ENDPOINT (ENTORNO)

Después de iniciar sesión:
1. En la parte superior izquierda, selecciona el **Endpoint** donde quieres desplegar
2. Generalmente dice **"Local"** o el nombre de tu entorno
3. Asegúrate de estar en el endpoint correcto

---

## 📍 PASO 3: IR A STACKS

En el menú lateral izquierdo:
1. Busca **Stacks**
2. Haz clic en **Stacks**

---

## 📍 PASO 4: CREAR NUEVO STACK

Verás un listado de stacks existentes:
1. Haz clic en el botón **+ Add Stack** (esquina superior derecha)
   O si ves "Create Stack", haz clic en ese botón

---

## 📍 PASO 5: SELECCIONAR "WEB EDITOR"

Se abrirá un menú con 3 opciones:
- Form
- Web editor
- URL
- Git repository

Haz clic en **Web editor** (la opción intermedia)

---

## 📍 PASO 6: NOMBRAR EL STACK

En el campo **Name** en la parte superior, ingresa:
```
bip2-production
```

(Puedes cambiar el nombre si lo deseas)

---

## 📍 PASO 7: COPIAR Y PEGAR EL DOCKER-COMPOSE

En la gran área de texto (el editor), verás un ejemplo de docker-compose.

1. **Borra TODO** el contenido del editor (selecciona todo con Ctrl+A y presiona Delete)

2. **Abre este archivo** en tu computadora local:
   ```
   /opt/proyectos/bip2/PORTAINER_DOCKER_COMPOSE.yml
   ```

3. **Copia TODO el contenido** (Ctrl+A, Ctrl+C)

4. **Pégalo en el editor** de Portainer (Ctrl+V)

Debería verse así:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    ...
  redis:
    image: redis:7-alpine
    ...
  
  # (y así sucesivamente)
```

---

## 📍 PASO 8: AGREGAR VARIABLES DE ENTORNO

Desplázate hacia **abajo** en la página.

Verás una sección llamada **Environment variables** (o "Env").

Hay varias formas de agregar variables:

### OPCIÓN A: Campos individuales

Si ves botones como "+ Add variable":

1. Haz clic en **+ Add variable**
2. En **Name** ingresa: `GEMINI_API_KEY`
3. En **Value** ingresa: `AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk`
4. Haz clic en **+ Add variable** nuevamente
5. En **Name** ingresa: `JWT_SECRET`
6. En **Value** ingresa: `Alann@2024!SecureJWTKeyForProduction123XYZ`

### OPCIÓN B: Formato texto

Si ves un área de texto grande:

Copia esto y pégalo:

```
GEMINI_API_KEY=AIzaSyBpRQ0BNTEZBBfu_OeZgNPmbKiBK3gevbk
JWT_SECRET=Alann@2024!SecureJWTKeyForProduction123XYZ
```

---

## 📍 PASO 9: REVISAR CONFIGURACIÓN

Antes de desplegar, verifica:

- ✅ **Name**: `bip2-production` (o tu nombre elegido)
- ✅ **Web editor**: Contiene el docker-compose.yml completo
- ✅ **Environment variables**: GEMINI_API_KEY y JWT_SECRET están presentes

---

## 📍 PASO 10: HACER DEPLOY

En la parte inferior de la página:

Busca el botón **Deploy the stack** (usualmente verde) y haz clic.

Se abrirá un nuevo tab mostrando el progreso.

---

## 📍 PASO 11: ESPERAR A QUE SE COMPLETE

El proceso mostrará:

```
Creating network bip2_bip2-network
Creating volume bip2_postgres_data
Creating service postgres
Creating service redis
...
Building backend (docker build)
Building frontend (docker build)
...
Success! Stack deployed
```

**Esto puede tardar 5-15 minutos**, especialmente en la primera compilación.

---

## 📍 PASO 12: VERIFICAR QUE TODO FUNCIONA

### En Portainer:

1. Ve a **Containers** en el menú lateral
2. Deberías ver 6 contenedores ejecutándose:
   - ✅ `qdrant-sync-postgres`
   - ✅ `qdrant-sync-redis`
   - ✅ `efc-canasta-mysql`
   - ✅ `efc-qdrant-local`
   - ✅ `bip2-backend`
   - ✅ `bip2-frontend`

3. Todos deberían mostrar estado **running** (verde)

### En tu navegador:

```
Frontend:      http://tu-ip-servidor:3011
Backend API:   http://tu-ip-servidor:3001/api
API Docs:      http://tu-ip-servidor:3001/api/docs
Qdrant:        http://tu-ip-servidor:6333
```

---

## 📍 PASO 13: VER LOGS (Si algo no funciona)

Si algún contenedor tiene problemas:

1. Ve a **Containers**
2. Haz clic en el contenedor que tiene problemas
3. Desplázate hacia abajo y busca **Logs**
4. Lee el error mostrado
5. Busca una solución en la sección de TROUBLESHOOTING

---

## ✅ ¡LISTO!

Tu aplicación BIP2 está desplegada en Portainer.

---

## 🆘 TROUBLESHOOTING RÁPIDO

### Los contenedores no inician
- Verifica que haya suficiente espacio en disco
- Revisa los logs en Portainer
- Asegúrate de que los puertos no estén ocupados

### El backend dice "unhealthy"
- Espera 40+ segundos (tiempo de start_period)
- Verifica que PostgreSQL esté corriendo
- Revisa que GEMINI_API_KEY esté configurada

### El frontend no se conecta
- Abre DevTools (F12)
- Ve a la pestaña **Console**
- Busca errores de red
- Verifica que la URL del API sea correcta

### Qdrant no responde
- Accede a http://tu-ip:6333 en el navegador
- Si no carga, revisa los logs de Qdrant
- Verifica que el puerto 6333 esté abierto

