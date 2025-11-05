# Solución al Error 127 en Portainer - BIP2

## Problema

Error al desplegar en Portainer:
```
Failed to deploy a stack:
compose build operation failed:
failed to solve: process "/bin/sh -c npx nest build || npm run build || node_modules/.bin/nest build" did not complete successfully: exit code: 127
```

El código de salida **127** significa "comando no encontrado", lo que indica que el CLI de NestJS no está disponible durante el build.

## Causas Posibles

1. **Contexto remoto de Git**: Cuando Docker construye desde `context: https://github.com/alannreyes/bip2.git#main`, puede haber problemas con la estructura de directorios
2. **Dependencias no instaladas**: Las devDependencies (incluyendo `@nestjs/cli`) pueden no estar instalándose correctamente
3. **Permisos o rutas incorrectas**: El contexto de build puede no estar accediendo correctamente a los archivos

## Soluciones

### Solución 1: Usar el Dockerfile Mejorado (RECOMENDADO)

El Dockerfile del backend ha sido actualizado para:
- ✅ Instalar dependencias de build necesarias (python3, make, g++)
- ✅ Verificar que `nest` CLI esté instalado antes de construir
- ✅ Intentar múltiples métodos de build como fallback
- ✅ Verificar que el build se completó correctamente

**Pasos:**
1. Asegúrate de que el código más reciente esté en el repositorio GitHub
2. En Portainer, elimina el stack anterior si existe
3. Vuelve a desplegar usando el mismo `docker-compose.yml`

### Solución 2: Usar Contexto Local (Si tienes acceso al servidor)

Si tienes acceso SSH al servidor donde corre Portainer, puedes clonar el repositorio localmente y usar contexto local:

**En el servidor:**
```bash
# Clonar el repositorio
cd /opt
git clone https://github.com/alannreyes/bip2.git
cd bip2
```

**En Portainer:**
Cambia el `docker-compose.yml` para usar contexto local:

```yaml
backend:
  build:
    context: /opt/bip2/backend
    dockerfile: Dockerfile
  # ... resto de la configuración
```

### Solución 3: Verificar que el Repositorio esté Actualizado

Asegúrate de que los cambios del Dockerfile estén en GitHub:

```bash
# En tu máquina local
git add backend/Dockerfile
git commit -m "Fix: Mejorar Dockerfile para resolver error 127"
git push origin main
```

Luego espera unos minutos y vuelve a intentar el despliegue en Portainer.

### Solución 4: Build Manual para Debugging

Si el problema persiste, puedes construir la imagen manualmente para ver el error exacto:

```bash
# En el servidor donde corre Portainer
docker build -t bip2-backend-test https://github.com/alannreyes/bip2.git#main:backend/Dockerfile
```

O si tienes el código localmente:

```bash
cd backend
docker build -t bip2-backend-test .
docker run --rm bip2-backend-test ls -la node_modules/.bin/ | grep nest
```

## Verificación del Fix

Después de aplicar el fix, verifica que:

1. **El build se completa sin errores**
2. **La imagen se crea correctamente**: `docker images | grep bip2-backend`
3. **El contenedor inicia**: Revisa los logs en Portainer
4. **El healthcheck pasa**: El endpoint `/api/health` debe responder

## Cambios Realizados en el Dockerfile

El nuevo Dockerfile incluye:

1. **Instalación de dependencias de build**:
   ```dockerfile
   RUN apk add --no-cache python3 make g++
   ```

2. **Verificación de nest CLI**:
   ```dockerfile
   RUN test -f node_modules/.bin/nest || (echo "ERROR: nest CLI not found" && exit 1)
   ```

3. **Múltiples métodos de build como fallback**:
   ```dockerfile
   RUN npm run build || \
       ./node_modules/.bin/nest build || \
       npx nest build || \
       (echo "ERROR: All build methods failed" && exit 1)
   ```

4. **Verificación del output del build**:
   ```dockerfile
   RUN test -d dist && test -f dist/main.js || (echo "ERROR: Build output not found" && exit 1)
   ```

## Próximos Pasos

1. ✅ **Commit y push** del Dockerfile mejorado a GitHub
2. ✅ **Esperar** 2-3 minutos para que GitHub actualice
3. ✅ **Eliminar** el stack fallido en Portainer
4. ✅ **Re-desplegar** el stack con el nuevo Dockerfile
5. ✅ **Monitorear** los logs durante el build

## Si el Problema Persiste

Si después de estos cambios el error continúa:

1. **Revisa los logs completos** en Portainer durante el build
2. **Verifica la versión de Docker** en Portainer (debe ser 20.10+)
3. **Revisa los recursos del servidor** (RAM, CPU, espacio en disco)
4. **Intenta construir solo el backend** primero para aislar el problema

## Contacto

Si necesitas ayuda adicional, incluye:
- Logs completos del build desde Portainer
- Versión de Docker: `docker --version`
- Versión de Node en la imagen: debería ser `node:20-alpine`
