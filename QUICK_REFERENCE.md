# 🚀 BIP2 - Quick Reference Card

## ⚡ Deployment Rápido (5 Pasos)

### 1️⃣ Validar Configuración
```bash
./validate-deployment.sh
```

### 2️⃣ Preparar Variables
```bash
./quick-deploy-portainer.sh
```

### 3️⃣ En Portainer
1. Stacks → Add Stack
2. Pegar `PORTAINER_DOCKER_COMPOSE.yml`
3. Agregar variables de entorno
4. Deploy

### 4️⃣ Verificar
```bash
curl http://localhost:3001/api/health
```

### 5️⃣ Acceder
- Frontend: `http://localhost:3011`
- Backend: `http://localhost:3001/api`
- API Docs: `http://localhost:3001/api/docs`

---

## 📋 Variables de Entorno Requeridas

```env
GEMINI_API_KEY=tu_api_key_aqui
JWT_SECRET=clave_segura_minimo_32_caracteres
```

**Generar JWT_SECRET:**
```bash
openssl rand -base64 32
```

---

## 🐳 Servicios y Puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Frontend | 3011 | http://localhost:3011 |
| Backend | 3001 | http://localhost:3001/api |
| API Docs | 3001 | http://localhost:3001/api/docs |
| PostgreSQL | 5433 | localhost:5433 |
| Redis | 6380 | localhost:6380 |
| Qdrant | 6333 | http://localhost:6333 |
| MySQL | 3307 | localhost:3307 |

---

## 🔍 Comandos Útiles

### Ver logs
```bash
docker logs -f bip2-backend
docker logs -f bip2-frontend
```

### Ver estado
```bash
docker ps
docker stats
```

### Reiniciar servicio
```bash
docker restart bip2-backend
docker restart bip2-frontend
```

### Health check
```bash
curl http://localhost:3001/api/health
```

---

## 🆘 Troubleshooting Rápido

### Backend no inicia
```bash
# 1. Ver logs
docker logs bip2-backend --tail 100

# 2. Verificar PostgreSQL
docker exec qdrant-sync-postgres pg_isready -U postgres

# 3. Verificar variables
docker exec bip2-backend env | grep GEMINI_API_KEY
```

### Frontend no carga
```bash
# 1. Verificar backend
curl http://localhost:3001/api/health

# 2. Ver logs
docker logs bip2-frontend --tail 100

# 3. Verificar variables
docker exec bip2-frontend env | grep NEXT_PUBLIC_API_URL
```

### Puerto en uso
```bash
# Ver qué usa el puerto
sudo lsof -i :3001

# Cambiar puerto en docker-compose
ports:
  - "3002:3001"  # Cambiar 3001 a 3002
```

---

## 📚 Documentación

### Guías Principales
- 📘 **PORTAINER_COMPLETE_GUIDE.md** - Guía completa
- 🔧 **TROUBLESHOOTING.md** - Solución de problemas
- 📋 **DEPLOYMENT_SUMMARY.md** - Resumen de cambios

### Scripts
- ✅ `validate-deployment.sh` - Validación
- 🚀 `quick-deploy-portainer.sh` - Deployment asistido

---

## ✅ Checklist Pre-Deployment

- [ ] Docker instalado
- [ ] Portainer instalado
- [ ] GEMINI_API_KEY obtenida
- [ ] JWT_SECRET generado
- [ ] Puertos disponibles
- [ ] Firewall configurado
- [ ] `validate-deployment.sh` ejecutado OK

---

## 📞 Ayuda

**Issue?** → Ver TROUBLESHOOTING.md  
**Deployment?** → Ver PORTAINER_COMPLETE_GUIDE.md  
**Support?** → GitHub Issues

---

**Tiempo de deployment: ~10 minutos** ⏱️  
**Servicios: 6 contenedores** 🐳  
**Estado: Listo para producción** ✅
