#!/bin/bash

# ============================================
# BIP2 Deployment Helper Script
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${NC}ℹ $1${NC}"
}

# Check if .env.production exists
check_env_file() {
    if [ ! -f .env.production ]; then
        print_error ".env.production not found!"
        print_info "Please create it from .env.production.example"
        exit 1
    fi
    print_success ".env.production found"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker is installed"
}

# Check if Docker Compose is installed
check_docker_compose() {
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose is installed"
}

# Create traefik network if it doesn't exist
create_traefik_network() {
    if ! docker network inspect traefik-public &> /dev/null; then
        print_info "Creating traefik-public network..."
        docker network create traefik-public
        print_success "traefik-public network created"
    else
        print_success "traefik-public network already exists"
    fi
}

# Deploy Traefik
deploy_traefik() {
    print_info "Deploying Traefik..."
    docker compose -f traefik-compose.yml up -d
    print_success "Traefik deployed"
}

# Build and deploy application
deploy_app() {
    print_info "Building and deploying application..."
    docker compose -f docker-compose.prod.yml up -d --build
    print_success "Application deployed"
}

# Show status
show_status() {
    print_info "Container status:"
    docker compose -f docker-compose.prod.yml ps
}

# Show logs
show_logs() {
    docker compose -f docker-compose.prod.yml logs -f
}

# Stop application
stop_app() {
    print_info "Stopping application..."
    docker compose -f docker-compose.prod.yml down
    print_success "Application stopped"
}

# Restart application
restart_app() {
    print_info "Restarting application..."
    docker compose -f docker-compose.prod.yml restart
    print_success "Application restarted"
}

# Update application
update_app() {
    print_info "Updating application..."
    git pull origin main
    docker compose -f docker-compose.prod.yml up -d --build
    print_success "Application updated"
}

# Backup database
backup_db() {
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    print_info "Creating database backup: $BACKUP_FILE"
    docker exec bip-postgres pg_dump -U postgres qdrant_catalog_sync > "$BACKUP_FILE"
    print_success "Backup created: $BACKUP_FILE"
}

# Main menu
show_menu() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║   BIP2 Deployment Helper               ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "1) Initial deployment (Traefik + App)"
    echo "2) Deploy application only"
    echo "3) Update application"
    echo "4) Show status"
    echo "5) Show logs"
    echo "6) Restart application"
    echo "7) Stop application"
    echo "8) Backup database"
    echo "9) Exit"
    echo ""
}

# Main execution
main() {
    # Pre-flight checks
    print_info "Running pre-flight checks..."
    check_docker
    check_docker_compose
    check_env_file
    echo ""

    if [ $# -eq 0 ]; then
        while true; do
            show_menu
            read -p "Choose an option: " choice
            case $choice in
                1)
                    create_traefik_network
                    deploy_traefik
                    deploy_app
                    show_status
                    ;;
                2)
                    deploy_app
                    show_status
                    ;;
                3)
                    update_app
                    show_status
                    ;;
                4)
                    show_status
                    ;;
                5)
                    show_logs
                    ;;
                6)
                    restart_app
                    show_status
                    ;;
                7)
                    stop_app
                    ;;
                8)
                    backup_db
                    ;;
                9)
                    print_info "Goodbye!"
                    exit 0
                    ;;
                *)
                    print_error "Invalid option"
                    ;;
            esac
        done
    else
        # Command line argument mode
        case $1 in
            init)
                create_traefik_network
                deploy_traefik
                deploy_app
                show_status
                ;;
            deploy)
                deploy_app
                show_status
                ;;
            update)
                update_app
                show_status
                ;;
            status)
                show_status
                ;;
            logs)
                show_logs
                ;;
            restart)
                restart_app
                show_status
                ;;
            stop)
                stop_app
                ;;
            backup)
                backup_db
                ;;
            *)
                print_error "Unknown command: $1"
                echo "Usage: $0 {init|deploy|update|status|logs|restart|stop|backup}"
                exit 1
                ;;
        esac
    fi
}

main "$@"
