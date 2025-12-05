# Guía de Seguridad y Autenticación - BIP2 RTI

## Resumen Ejecutivo

El sistema BIP2 RTI incluye un sistema de autenticación configurable que permite diferentes modos de operación según las necesidades de despliegue. Por defecto, **la autenticación está deshabilitada** para facilitar el desarrollo y uso interno.

## Configuración por Variables de Entorno

| Variable | Valores | Default | Descripción |
|----------|---------|---------|-------------|
| `AUTH_ENABLED` | `true` / `false` | `false` | Habilita/deshabilita autenticación global |
| `AUTH_MODE` | `jwt` / `api-key` / `both` | `both` | Modo de autenticación cuando está habilitado |
| `SWAGGER_ENABLED` | `true` / `false` | `true` | Muestra/oculta documentación Swagger |
| `JWT_SECRET` | string | (requerido) | Clave secreta para firmar tokens JWT |

## Modos de Autenticación

### Modo 1: Sin Autenticación (`AUTH_ENABLED=false`)
- **Uso**: Desarrollo, pruebas internas, redes privadas confiables
- **Comportamiento**: Todos los endpoints son públicos
- **Comando**: `AUTH_ENABLED=false docker-compose up -d`

### Modo 2: Solo API Keys (`AUTH_MODE=api-key`)
- **Uso**: Integraciones con aplicaciones externas
- **Comportamiento**: Requiere header `X-API-Key` en cada request
- **Ventaja**: Keys no expiran (o expiran según configuración)
- **Comando**: `AUTH_ENABLED=true AUTH_MODE=api-key docker-compose up -d`

### Modo 3: Solo JWT (`AUTH_MODE=jwt`)
- **Uso**: Integración con Microsoft Entra ID (Azure AD)
- **Comportamiento**: Requiere header `Authorization: Bearer <token>`
- **Ventaja**: Integración con sistemas de identidad corporativos
- **Comando**: `AUTH_ENABLED=true AUTH_MODE=jwt docker-compose up -d`

### Modo 4: Híbrido (`AUTH_MODE=both`)
- **Uso**: Máxima flexibilidad
- **Comportamiento**: Acepta JWT o API Key
- **Ventaja**: Permite migración gradual entre métodos
- **Comando**: `AUTH_ENABLED=true AUTH_MODE=both docker-compose up -d`

---

## Evidencia de Pruebas

### Escenario 1: AUTH_ENABLED=false (Sin Autenticación)

**Configuración:**
```bash
AUTH_ENABLED=false docker-compose up -d backend
```

**Log del sistema:**
```
🔒 Security: Rate Limiting ✓ | Helmet ✓ | Auth: ○ Disabled
```

**Prueba 1.1: Health endpoint**
```bash
$ curl -s http://localhost:3001/api/health | jq .
{
  "status": "healthy",
  "timestamp": "2025-12-05T22:50:27.051Z",
  "services": {
    "database": { "healthy": true },
    "qdrant": { "healthy": true },
    "redis": { "healthy": true }
  }
}
```
✅ **Resultado**: OK (200)

**Prueba 1.2: Búsqueda sin credenciales**
```bash
$ curl -s -X POST http://localhost:3001/api/search/text \
  -H "Content-Type: application/json" \
  -d '{"collections":["catalogo_stock"],"query":"martillo","limit":2}'
```
✅ **Resultado**: OK (200) - Retorna resultados

**Prueba 1.3: Swagger disponible**
```bash
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/docs
200
```
✅ **Resultado**: OK (200)

---

### Escenario 2: AUTH_MODE=api-key

**Configuración:**
```bash
AUTH_ENABLED=true AUTH_MODE=api-key docker-compose up -d backend
```

**Log del sistema:**
```
🔒 Security: Rate Limiting ✓ | Helmet ✓ | Auth: ✓ Enabled
```

**Prueba 2.1: Búsqueda SIN API Key**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -d '{"collections":["catalogo_stock"],"query":"martillo","limit":1}'
{
  "message": "API Key required. Use header: X-API-Key",
  "error": "Unauthorized",
  "statusCode": 401
}
```
✅ **Resultado**: 401 Unauthorized (correcto)

**Prueba 2.2: Health sigue público**
```bash
$ curl -s http://localhost:3001/api/health | jq -r '.status'
healthy
```
✅ **Resultado**: OK (200) - Health siempre es público

**Prueba 2.3: Verificar API Key (endpoint público)**
```bash
$ curl -s -X POST http://localhost:3001/api/api-keys/verify \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"bip2_invalid_test_key"}'
{
  "valid": false,
  "reason": "API Key not found"
}
```
✅ **Resultado**: OK (200) - Endpoint de verificación es público

**Prueba 2.4: Búsqueda CON API Key válida**
```bash
$ curl -s -X POST http://localhost:3001/api/search/text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bip2_pIBPP20EtWnantGaFqqxwqF38HJ2T7g1" \
  -d '{"collections":["catalogo_stock"],"query":"taladro","limit":1}'
{
  "query": "taladro",
  "total_results": 1,
  "results": [{ "payload": { "Articulo_Descripcion": "BROCA P/CONCRETO 1/2\"" } }]
}
```
✅ **Resultado**: OK (200) - Búsqueda exitosa

**Prueba 2.5: JWT rechazado en modo api-key**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{"collections":["catalogo_stock"],"query":"taladro","limit":1}'
{
  "message": "API Key required. Use header: X-API-Key",
  "statusCode": 401
}
```
✅ **Resultado**: 401 - JWT no aceptado en modo api-key

**Prueba 2.6: API Key inválida**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bip2_INVALID_KEY_12345" \
  -d '{"collections":["catalogo_stock"],"query":"taladro","limit":1}'
{
  "message": "API Key not found",
  "statusCode": 401
}
```
✅ **Resultado**: 401 - Key inválida rechazada

---

### Escenario 3: AUTH_MODE=jwt

**Configuración:**
```bash
AUTH_ENABLED=true AUTH_MODE=jwt docker-compose up -d backend
```

**Prueba 3.1: Sin credenciales**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -d '{"collections":["catalogo_stock"],"query":"martillo","limit":1}'
{
  "message": "Invalid or missing authentication",
  "statusCode": 401
}
```
✅ **Resultado**: 401 Unauthorized (correcto)

**Prueba 3.2: Con JWT válido**
```bash
$ curl -s -X POST http://localhost:3001/api/search/text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{"collections":["catalogo_stock"],"query":"destornillador","limit":1}'
# Resultado:
"DESARMADOR PLANO AISLADO 1000V 8 X 175MM CATU MO-65209"
```
✅ **Resultado**: OK (200) - Búsqueda exitosa

**Prueba 3.3: API Key rechazada en modo jwt**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bip2_pIBPP20..." \
  -d '{"collections":["catalogo_stock"],"query":"martillo","limit":1}'
{
  "message": "Invalid or missing authentication",
  "statusCode": 401
}
```
✅ **Resultado**: 401 - API Key no aceptada en modo jwt

---

### Escenario 4: AUTH_MODE=both (Híbrido)

**Configuración:**
```bash
AUTH_ENABLED=true AUTH_MODE=both docker-compose up -d backend
```

**Prueba 4.1: Sin credenciales**
```bash
$ curl -s http://localhost:3001/api/search/text -X POST \
  -H "Content-Type: application/json" \
  -d '{"collections":["catalogo_stock"],"query":"martillo","limit":1}'
{
  "message": "Invalid or missing authentication",
  "statusCode": 401
}
```
✅ **Resultado**: 401 Unauthorized (correcto)

**Prueba 4.2: Con JWT válido**
```bash
$ curl -s -X POST http://localhost:3001/api/search/text \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{"collections":["catalogo_stock"],"query":"llave inglesa","limit":1}'
# Resultado:
"LLAVE ALLEN HEXAGONAL 14MM"
```
✅ **Resultado**: OK (200) - JWT aceptado

**Prueba 4.3: Con API Key válida**
```bash
$ curl -s -X POST http://localhost:3001/api/search/text \
  -H "X-API-Key: bip2_pIBPP20EtWnantGaFqqxwqF38HJ2T7g1" \
  -d '{"collections":["catalogo_stock"],"query":"pinza","limit":1}'
# Resultado:
"GRAPA P/ZUNCHO METALICO 1/2\""
```
✅ **Resultado**: OK (200) - API Key aceptada

---

## Gestión de API Keys

### Crear API Key (requiere JWT admin)

```bash
# Generar token admin
JWT_SECRET="tu-secret" npx ts-node scripts/generate-admin-token.ts

# Crear API Key
curl -X POST http://localhost:3001/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "mi-aplicacion",
    "description": "API Key para sistema X",
    "expiresInDays": null
  }'
```

**Respuesta:**
```json
{
  "message": "⚠️ IMPORTANTE: Guarda esta API Key. No se puede recuperar después.",
  "apiKey": {
    "id": "5d06c4a3-78aa-4241-a39d-855340458984",
    "name": "mi-aplicacion",
    "keyPrefix": "bip2_pIB",
    "expiresAt": null,
    "createdAt": "2025-12-05T22:56:26.725Z"
  },
  "key": "bip2_pIBPP20EtWnantGaFqqxwqF38HJ2T7g1",
  "usage": {
    "header": "X-API-Key",
    "example": "curl -H \"X-API-Key: bip2_pIBPP20...\" http://servidor/api/search/text"
  }
}
```

### Endpoints de Gestión

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/api-keys` | Crear nueva API Key | JWT Admin |
| `GET` | `/api/api-keys` | Listar todas las keys | JWT Admin |
| `GET` | `/api/api-keys/:id` | Ver detalle de una key | JWT Admin |
| `PATCH` | `/api/api-keys/:id/revoke` | Revocar (desactivar) | JWT Admin |
| `PATCH` | `/api/api-keys/:id/activate` | Reactivar key | JWT Admin |
| `DELETE` | `/api/api-keys/:id` | Eliminar permanentemente | JWT Admin |
| `POST` | `/api/api-keys/verify` | Verificar si key es válida | Público |

### Características de las API Keys

- **Formato**: `bip2_xxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Almacenamiento**: Solo hash SHA-256 (nunca texto plano)
- **Restricciones opcionales**:
  - Por IP (`allowedIps: ["192.168.1.100", "10.0.0.0/8"]`)
  - Por endpoints (`allowedEndpoints: ["/api/search"]`)
- **Expiración**: Configurable o sin expiración
- **Tracking**: Último uso y contador de usos

---

## Endpoints Siempre Públicos

Los siguientes endpoints están marcados con `@Public()` y siempre son accesibles:

- `GET /api/health` - Estado del sistema
- `POST /api/api-keys/verify` - Verificar validez de API Key

---

## Seguridad Adicional Habilitada

Independientemente del modo de autenticación, siempre están activos:

| Feature | Descripción |
|---------|-------------|
| **Rate Limiting** | 10 req/seg, 100 req/min, 1000 req/hora |
| **Helmet** | Headers de seguridad HTTP |
| **Audit Logging** | Logs estructurados JSON de cada request |
| **CORS** | Configurado por `CORS_ORIGIN` |

---

## Recomendaciones por Entorno

| Entorno | AUTH_ENABLED | AUTH_MODE | SWAGGER_ENABLED |
|---------|--------------|-----------|-----------------|
| Desarrollo | `false` | N/A | `true` |
| QA/Staging | `true` | `both` | `true` |
| Producción (interno) | `true` | `api-key` | `false` |
| Producción (con Entra ID) | `true` | `jwt` o `both` | `false` |

---

## Troubleshooting

### "Invalid or missing authentication" con JWT
- Verificar que `JWT_SECRET` sea el mismo usado para generar el token
- Verificar que el token no haya expirado

### "API Key not found"
- Verificar que la key esté activa (`isActive: true`)
- Verificar que no haya expirado

### Rate limiting (429 Too Many Requests)
- Esperar unos segundos antes de reintentar
- Implementar backoff exponencial en clientes

---

*Documento generado: 2025-12-05*
*Versión: 1.0*
