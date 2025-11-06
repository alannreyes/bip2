# Guía de Despliegue SIN Docker (Recomendado)

## Pasos para Desplegar el Frontend Directamente

### 1. En tu servidor (192.168.40.197), ejecuta:

```bash
# Crear directorio
mkdir -p /opt/bip2-frontend
cd /opt/bip2-frontend

# Clonar repositorio
git clone https://github.com/alannreyes/bip2.git .

# Ir al frontend
cd frontend

# Instalar dependencias
npm install --legacy-peer-deps

# Configurar variable de entorno
export NEXT_PUBLIC_API_URL=http://192.168.40.197:3001/api

# Hacer build (AQUÍ VERÁS EL ERROR REAL SI HAY ALGUNO)
npm run build

# Si el build funciona, iniciar
npm run start
```

### 2. Con PM2 (Para mantenerlo corriendo):

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar la aplicación
cd /opt/bip2-frontend/frontend
pm2 start npm --name "bip2-frontend" -- start

# Ver estado
pm2 status

# Ver logs
pm2 logs bip2-frontend

# Guardar configuración para que inicie automáticamente
pm2 save
pm2 startup
```

### 3. Configurar como servicio systemd (Alternativa a PM2):

Crear archivo `/etc/systemd/system/bip2-frontend.service`:

```ini
[Unit]
Description=BIP2 Frontend
After=network.target

[Service]
Type=simple
User=tu-usuario
WorkingDirectory=/opt/bip2-frontend/frontend
Environment="NEXT_PUBLIC_API_URL=http://192.168.40.197:3001/api"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Luego:
```bash
sudo systemctl daemon-reload
sudo systemctl enable bip2-frontend
sudo systemctl start bip2-frontend
sudo systemctl status bip2-frontend
```

### 4. Con Nginx como reverse proxy (Opcional):

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Ventajas de este método:

✅ **Ves el error real** del build inmediatamente
✅ **Más rápido** de configurar
✅ **Más fácil de debuggear**
✅ **No depende de Docker**
✅ **Puedes actualizar fácilmente** con `git pull && npm run build`

## Si el build falla localmente:

Verás el error completo y podremos solucionarlo directamente.

