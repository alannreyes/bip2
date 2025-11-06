# Instalar Node.js en el Servidor

## Opción 1: Usando NodeSource (Recomendado - Versión más reciente)

```bash
# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalación
node --version
npm --version
```

## Opción 2: Usando apt (Más simple pero versión más antigua)

```bash
sudo apt update
sudo apt install -y nodejs npm

# Verificar instalación
node --version
npm --version
```

## Opción 3: Usando NVM (Node Version Manager - Más flexible)

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recargar shell
source ~/.bashrc

# Instalar Node.js 20
nvm install 20
nvm use 20

# Verificar
node --version
npm --version
```

## Después de instalar Node.js:

```bash
cd ~/bip2/frontend

# Instalar dependencias
npm install --legacy-peer-deps

# Configurar variable de entorno
export NEXT_PUBLIC_API_URL=http://192.168.40.197:3001/api

# Hacer build (AQUÍ VERÁS EL ERROR REAL)
npm run build

# Si funciona, instalar PM2
sudo npm install -g pm2

# Iniciar aplicación
pm2 start npm --name "frontend" -- start

# Guardar configuración
pm2 save
pm2 startup
```

