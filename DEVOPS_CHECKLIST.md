# ✅ DevOps Deployment Checklist - BIP2

Checklist paso a paso para DevOps. Marca cada item al completarlo.

---

## 📋 Pre-Deployment

### Preparación del Servidor

- [ ] Servidor Ubuntu 20.04+ disponible
- [ ] Mínimo 8GB RAM (16GB recomendado)
- [ ] Mínimo 50GB disco SSD
- [ ] Acceso SSH con permisos sudo
- [ ] Puertos 80 y 443 abiertos en firewall

### DNS y Dominios

- [ ] Dominio principal configurado (ej: `bip.empresa.com`)
- [ ] Subdominio API configurado (ej: `api.bip.empresa.com`)
- [ ] Registros A/CNAME apuntando al servidor
- [ ] Verificar con: `nslookup bip.empresa.com`
- [ ] Verificar con: `nslookup api.bip.empresa.com`

### Credenciales y API Keys

- [ ] API Key de Google Gemini obtenida
  - URL: https://aistudio.google.com/app/apikey
  - Guardada de forma segura
- [ ] Credenciales de base de datos SQL Server/MySQL/PostgreSQL
  - Host/IP
  - Puerto
  - Usuario
  - Contraseña
  - Nombre de BD

---

## 📋 Deployment

### Instalación de Docker

```bash
- [ ] curl -fsSL https://get.docker.com | sh
- [ ] sudo usermod -aG docker $USER
- [ ] newgrp docker
- [ ] docker --version  # Verificar instalación
- [ ] docker compose version  # Verificar compose
```

### Clonar Repositorio

```bash
- [ ] mkdir -p ~/proyectos
- [ ] cd ~/proyectos
- [ ] git clone https://github.com/alannreyes/bip2.git
- [ ] cd bip2
```

### Configurar Variables de Entorno

```bash
- [ ] cp .env.production.example .env.production
- [ ] nano .env.production
```

**Editar estos valores:**

- [ ] `POSTGRES_PASSWORD` - Password seguro (min 32 chars)
- [ ] `REDIS_PASSWORD` - Password seguro (min 32 chars)
- [ ] `GEMINI_API_KEY` - Tu API key de Gemini
- [ ] `JWT_SECRET` - Token aleatorio (min 48 chars)
- [ ] `FRONTEND_DOMAIN` - Tu dominio frontend
- [ ] `BACKEND_DOMAIN` - Tu dominio backend API
- [ ] `CORS_ORIGIN` - URL del frontend (https://...)
- [ ] `NEXT_PUBLIC_API_URL` - URL de la API (https://api...)

**Generar passwords seguros:**
```bash
- [ ] openssl rand -base64 32  # Para POSTGRES_PASSWORD
- [ ] openssl rand -base64 32  # Para REDIS_PASSWORD
- [ ] openssl rand -base64 48  # Para JWT_SECRET
```

### Configurar Traefik

```bash
- [ ] nano traefik-data/traefik.yml
```

- [ ] Cambiar `admin@yourcompany.com` por tu email real
- [ ] Guardar archivo

### Configurar Firewall

```bash
- [ ] sudo ufw enable
- [ ] sudo ufw allow 22/tcp   # SSH
- [ ] sudo ufw allow 80/tcp   # HTTP
- [ ] sudo ufw allow 443/tcp  # HTTPS
- [ ] sudo ufw status  # Verificar
```

### Crear Red de Traefik

```bash
- [ ] docker network create traefik-public
```

### Iniciar Traefik

```bash
- [ ] docker compose -f traefik-compose.yml up -d
- [ ] docker logs traefik  # Verificar que inició
```

### Desplegar la Aplicación

```bash
- [ ] docker compose -f docker-compose.prod.yml up -d --build
```

**Esto iniciará 5 contenedores:**
- [ ] bip-postgres (Base de datos)
- [ ] bip-redis (Cache)
- [ ] bip-qdrant (Vector DB)
- [ ] bip-backend (API NestJS)
- [ ] bip-frontend (Next.js)

### Verificar Deployment

```bash
- [ ] docker compose -f docker-compose.prod.yml ps  # Todos "Up"
- [ ] docker logs bip-backend | grep "Application is running"
- [ ] docker logs bip-frontend | grep "ready"
```

---

## 📋 Post-Deployment (CRÍTICO)

**⚠️ El sistema NO es funcional hasta completar estos pasos.**

Ver archivo completo: **`POST_DEPLOYMENT_GUIDE.md`**

### Verificaciones Inmediatas

- [ ] Frontend accesible: `https://TU_DOMINIO`
- [ ] Backend API accesible: `https://api.TU_DOMINIO/api/health`
- [ ] Swagger UI accesible: `https://api.TU_DOMINIO/api/docs`
- [ ] Certificados SSL activos (candado verde)

### Health Check

```bash
- [ ] curl https://api.TU_DOMINIO/api/health
```

**Verificar que todos los servicios estén "healthy":**
- [ ] database: healthy
- [ ] qdrant: healthy
- [ ] redis: healthy

### Configurar Primer Datasource

**Seguir instrucciones detalladas en `POST_DEPLOYMENT_GUIDE.md`**

- [ ] Acceder a Swagger UI: `https://api.TU_DOMINIO/api/docs`
- [ ] Crear datasource usando POST /api/datasources
- [ ] Probar conexión del datasource
- [ ] Iniciar sincronización completa
- [ ] Esperar a que complete (monitorear logs)
- [ ] Verificar que hay datos en la colección

### Probar Búsqueda

- [ ] Probar búsqueda desde el frontend
- [ ] Probar búsqueda vía API:
  ```bash
  curl -X POST https://api.TU_DOMINIO/api/search/text \
    -H "Content-Type: application/json" \
    -d '{"query": "producto test", "collections": ["catalogo_productos"], "limit": 5}'
  ```
- [ ] Verificar que devuelve resultados

---

## 📋 Configuración Adicional

### Backups Automáticos (Recomendado)

```bash
- [ ] Crear script de backup
- [ ] Configurar cronjob para backups diarios
- [ ] Probar restauración de backup
```

Ver `DEPLOYMENT.md` sección "Backups" para más detalles.

### Monitoreo (Opcional)

- [ ] Configurar alertas de logs
- [ ] Configurar monitoreo de recursos (CPU, RAM, Disco)
- [ ] Configurar uptime monitoring

### Seguridad Adicional

- [ ] Deshabilitar login de root por SSH
- [ ] Instalar fail2ban
- [ ] Configurar SSH solo con key (sin password)
- [ ] Revisar logs regularmente

---

## 📋 Verificación Final

### Checklist Funcional

- [ ] ✅ Todos los contenedores corriendo
- [ ] ✅ Health check muestra "healthy"
- [ ] ✅ SSL/HTTPS funcionando
- [ ] ✅ API Key de Gemini configurada
- [ ] ✅ Al menos 1 datasource configurado
- [ ] ✅ Sincronización completada con éxito
- [ ] ✅ Búsqueda de texto funciona
- [ ] ✅ Frontend carga y muestra resultados
- [ ] ✅ No hay errores en logs

### Pruebas Finales

```bash
# 1. Health check
- [ ] curl https://api.TU_DOMINIO/api/health

# 2. Listar datasources
- [ ] curl https://api.TU_DOMINIO/api/datasources

# 3. Listar colecciones
- [ ] curl https://api.TU_DOMINIO/api/collections

# 4. Búsqueda de prueba
- [ ] curl -X POST https://api.TU_DOMINIO/api/search/text \
      -H "Content-Type: application/json" \
      -d '{"query": "test", "limit": 5}'

# 5. Acceder al frontend en el navegador
- [ ] https://TU_DOMINIO
```

---

## 🎉 Deployment Completado

Si todos los items están marcados:

✅ **El sistema BIP2 está completamente funcional y listo para usar**

---

## 📞 Soporte

- **Documentación completa:** Ver `DEPLOYMENT.md`
- **Configuración post-deployment:** Ver `POST_DEPLOYMENT_GUIDE.md`
- **Guía rápida:** Ver `QUICK_START.md`
- **API Docs:** https://api.TU_DOMINIO/api/docs
- **Issues:** https://github.com/alannreyes/bip2/issues
- **Email:** alannreyesj@gmail.com

---

## 📝 Notas para el Equipo

### Tiempos Estimados

- Preparación del servidor: 30 min
- Instalación de Docker: 10 min
- Configuración de variables: 15 min
- Deployment de contenedores: 10 min
- Configuración post-deployment: 30 min
- Primera sincronización: 30 min - 2 horas (depende del tamaño del catálogo)

**Total estimado: 2-4 horas**

### Puntos Críticos

1. **API Key de Gemini** - Sin esto, la app no funciona
2. **Acceso a base de datos** - Necesario para el datasource
3. **Primera sincronización** - Debe completarse para tener datos

### Contactos de Emergencia

- Desarrollador: alannreyesj@gmail.com
- Repositorio: https://github.com/alannreyes/bip2
