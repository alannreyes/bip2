#!/bin/bash

set -e

echo "=================================================="
echo "🚀 Instalación de Qdrant Catalog Sync"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check dependencies
echo -e "${BLUE}📋 Verificando dependencias...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado${NC}"
    echo "Instala Node.js 20+: https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm no está instalado${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado${NC}"
    echo "Instala Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose no está instalado${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Todas las dependencias están instaladas${NC}"
echo ""

# Node version check
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Node.js version $NODE_VERSION detectada. Se recomienda v20+${NC}"
fi

echo -e "${BLUE}📦 Instalando dependencias del backend...${NC}"
cd backend

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env no existe, copiando desde .env.example${NC}"
    cp .env.example .env
    echo -e "${RED}🔑 IMPORTANTE: Edita backend/.env y configura tu GEMINI_API_KEY${NC}"
fi

npm install

echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo ""

echo -e "${BLUE}🐳 Iniciando servicios Docker (PostgreSQL + Redis)...${NC}"
docker-compose up -d

echo -e "${YELLOW}⏳ Esperando a que PostgreSQL esté listo...${NC}"
sleep 5

# Check if postgres is ready
MAX_RETRIES=30
RETRY_COUNT=0
until docker exec qdrant-sync-postgres pg_isready -U postgres > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}❌ PostgreSQL no está listo después de $MAX_RETRIES intentos${NC}"
        exit 1
    fi
    echo -e "${YELLOW}⏳ Esperando PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
    sleep 2
done

echo -e "${GREEN}✅ PostgreSQL está listo${NC}"
echo ""

echo -e "${BLUE}📦 Instalando dependencias del frontend...${NC}"
cd ../frontend

if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local no existe, copiando desde .env.example${NC}"
    cp .env.example .env.local
fi

npm install

echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
echo ""

echo "=================================================="
echo -e "${GREEN}🎉 Instalación completada!${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}📝 Próximos pasos:${NC}"
echo ""
echo "1️⃣  Configura tu Gemini API Key:"
echo -e "   ${YELLOW}nano backend/.env${NC}"
echo "   Busca: GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE"
echo "   Reemplaza con tu API key de: https://aistudio.google.com/apikey"
echo ""
echo "2️⃣  Inicia el backend:"
echo -e "   ${YELLOW}cd backend && npm run start:dev${NC}"
echo ""
echo "3️⃣  En otra terminal, inicia el frontend:"
echo -e "   ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
echo "4️⃣  Abre tu navegador:"
echo -e "   ${BLUE}http://localhost:3000${NC}"
echo ""
echo "📚 Documentación:"
echo "   - README.md - Guía completa"
echo "   - MIGRATION.md - Info sobre modelos Gemini"
echo "   - CHANGELOG.md - Historial de cambios"
echo ""
echo -e "${GREEN}¡Disfruta! 🚀${NC}"
