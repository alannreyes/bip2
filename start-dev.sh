#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=================================================="
echo -e "${BLUE}🚀 Iniciando Qdrant Catalog Sync (Dev Mode)${NC}"
echo "=================================================="
echo ""

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ backend/.env no existe${NC}"
    echo "Ejecuta primero: ./install.sh"
    exit 1
fi

# Check if GEMINI_API_KEY is configured
if grep -q "YOUR_GEMINI_API_KEY_HERE" backend/.env; then
    echo -e "${RED}❌ GEMINI_API_KEY no está configurado${NC}"
    echo -e "${YELLOW}Edita backend/.env y agrega tu Gemini API Key${NC}"
    echo ""
    echo "Obtén tu API key en: https://aistudio.google.com/apikey"
    echo ""
    read -p "¿Quieres continuar sin API key (algunas funciones no funcionarán)? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Docker containers
echo -e "${BLUE}📦 Verificando servicios Docker...${NC}"
if ! docker ps | grep -q qdrant-sync-postgres; then
    echo -e "${YELLOW}⚠️  PostgreSQL no está corriendo, iniciando...${NC}"
    cd backend && docker-compose up -d postgres
    sleep 5
fi

if ! docker ps | grep -q qdrant-sync-redis; then
    echo -e "${YELLOW}⚠️  Redis no está corriendo, iniciando...${NC}"
    cd backend && docker-compose up -d redis
    sleep 3
fi

echo -e "${GREEN}✅ Servicios Docker corriendo${NC}"
echo ""

# Check Qdrant connectivity
echo -e "${BLUE}🔍 Verificando conexión a Qdrant...${NC}"
QDRANT_HOST=$(grep QDRANT_HOST backend/.env | cut -d '=' -f2)
QDRANT_PORT=$(grep QDRANT_PORT backend/.env | cut -d '=' -f2)

if timeout 5 bash -c "echo > /dev/tcp/$QDRANT_HOST/$QDRANT_PORT" 2>/dev/null; then
    echo -e "${GREEN}✅ Qdrant accesible en $QDRANT_HOST:$QDRANT_PORT${NC}"
else
    echo -e "${YELLOW}⚠️  No se puede conectar a Qdrant en $QDRANT_HOST:$QDRANT_PORT${NC}"
    echo "   Verifica que Qdrant esté corriendo"
    echo ""
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✅ Sistema listo para iniciar${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}Próximos pasos:${NC}"
echo ""
echo "Terminal 1 - Backend:"
echo -e "  ${YELLOW}cd backend && npm run start:dev${NC}"
echo ""
echo "Terminal 2 - Frontend:"
echo -e "  ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
echo "Luego abre: ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}TIP: Usa 'tmux' o 'screen' para múltiples terminales${NC}"
echo ""
