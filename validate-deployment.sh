#!/bin/bash

# ==============================================
# BIP2 Deployment Validation Script
# ==============================================
# This script validates the Docker Compose configuration
# and checks for common deployment issues
# ==============================================

set -e

echo "=================================="
echo "BIP2 Deployment Validation Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info() {
    echo "[INFO] $1"
}

# Counter for errors and warnings
ERRORS=0
WARNINGS=0

# Check if Docker is installed
print_info "Checking Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker is installed: $DOCKER_VERSION"
else
    print_error "Docker is not installed. Please install Docker first."
    ERRORS=$((ERRORS + 1))
fi

# Check if Docker Compose is installed
print_info "Checking Docker Compose installation..."
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version)
    print_success "Docker Compose is installed: $COMPOSE_VERSION"
else
    print_error "Docker Compose is not installed. Please install Docker Compose."
    ERRORS=$((ERRORS + 1))
fi

# Validate PORTAINER_DOCKER_COMPOSE.yml
print_info "Validating PORTAINER_DOCKER_COMPOSE.yml..."
if [ -f "PORTAINER_DOCKER_COMPOSE.yml" ]; then
    if docker compose -f PORTAINER_DOCKER_COMPOSE.yml config > /dev/null 2>&1; then
        print_success "PORTAINER_DOCKER_COMPOSE.yml is valid"
    else
        print_error "PORTAINER_DOCKER_COMPOSE.yml has syntax errors"
        docker compose -f PORTAINER_DOCKER_COMPOSE.yml config 2>&1 | tail -5
        ERRORS=$((ERRORS + 1))
    fi
else
    print_error "PORTAINER_DOCKER_COMPOSE.yml not found"
    ERRORS=$((ERRORS + 1))
fi

# Validate docker-compose-portainer.yml
print_info "Validating docker-compose-portainer.yml..."
if [ -f "docker-compose-portainer.yml" ]; then
    if docker compose -f docker-compose-portainer.yml config > /dev/null 2>&1; then
        print_success "docker-compose-portainer.yml is valid"
    else
        print_error "docker-compose-portainer.yml has syntax errors"
        docker compose -f docker-compose-portainer.yml config 2>&1 | tail -5
        ERRORS=$((ERRORS + 1))
    fi
else
    print_error "docker-compose-portainer.yml not found"
    ERRORS=$((ERRORS + 1))
fi

# Check for required environment files
print_info "Checking environment configuration files..."
if [ -f ".env.portainer" ]; then
    print_success ".env.portainer template found"
else
    print_warning ".env.portainer not found (template for Portainer deployment)"
    WARNINGS=$((WARNINGS + 1))
fi

# Check Dockerfiles
print_info "Checking Dockerfiles..."
if [ -f "backend/Dockerfile" ]; then
    print_success "backend/Dockerfile found"
    # Check if curl is installed in Dockerfile
    if grep -q "curl" backend/Dockerfile; then
        print_success "Backend Dockerfile includes curl for healthcheck"
    else
        print_warning "Backend Dockerfile may be missing curl for healthcheck"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    print_error "backend/Dockerfile not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "frontend/Dockerfile" ]; then
    print_success "frontend/Dockerfile found"
    # Check if curl is installed in Dockerfile
    if grep -q "curl" frontend/Dockerfile; then
        print_success "Frontend Dockerfile includes curl for healthcheck"
    else
        print_warning "Frontend Dockerfile may be missing curl for healthcheck"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    print_error "frontend/Dockerfile not found"
    ERRORS=$((ERRORS + 1))
fi

# Check for hardcoded secrets
print_info "Checking for hardcoded secrets..."
HARDCODED_KEYS=0

# Check all docker-compose files for potential hardcoded API keys
for file in docker-compose*.yml PORTAINER_DOCKER_COMPOSE.yml; do
    if [ -f "$file" ]; then
        # Look for patterns that might indicate hardcoded API keys (excluding placeholders)
        if grep -E "GEMINI_API_KEY.*AIza" "$file" > /dev/null 2>&1; then
            print_warning "Potential hardcoded GEMINI_API_KEY found in $file"
            HARDCODED_KEYS=$((HARDCODED_KEYS + 1))
        fi
    fi
done

if [ $HARDCODED_KEYS -eq 0 ]; then
    print_success "No hardcoded API keys detected in compose files"
else
    print_warning "Found $HARDCODED_KEYS file(s) with potential hardcoded API keys"
    WARNINGS=$((WARNINGS + 1))
fi

# Check port conflicts
print_info "Checking for port availability..."
PORTS=(3001 3011 5433 6333 6334 6380 3307)
for port in "${PORTS[@]}"; do
    if lsof -i:$port > /dev/null 2>&1; then
        print_warning "Port $port is already in use"
        WARNINGS=$((WARNINGS + 1))
    else
        print_success "Port $port is available"
    fi
done

# Check disk space
print_info "Checking disk space..."
AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
print_success "Available disk space: $AVAILABLE_SPACE"

# Summary
echo ""
echo "=================================="
echo "Validation Summary"
echo "=================================="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    print_error "Validation failed with $ERRORS error(s). Please fix the errors before deployment."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    print_warning "Validation passed with $WARNINGS warning(s). Review warnings before deployment."
    exit 0
else
    print_success "All validations passed! Ready for deployment."
    exit 0
fi
